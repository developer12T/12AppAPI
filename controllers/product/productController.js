const axios = require('axios')
const { Product } = require('../../models/cash/product')
const fs = require('fs')
const path = require('path')
const productModel = require('../../models/cash/product')
const stockModel = require('../../models/cash/stock')
const { getSocket } = require('../../socket')
const { getModelsByChannel } = require('../../middleware/channel')
const { productQuery } = require('../../controllers/queryFromM3/querySctipt')
const { group } = require('console')
const { flatMap } = require('lodash')
const distributionModel = require('../../models/cash/distribution')

exports.getProductAll = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { Product } = getModelsByChannel(channel, res, productModel)
    let products = await Product.find({}, { _id: 0, __v: 0 }).lean()

    if (!products.length) {
      return res
        .status(404)
        .json({ status: '404', message: 'No products found!' })
    }

    products = products.map(product => {
      let modifiedProduct = { ...product }

      modifiedProduct.listUnit = modifiedProduct.listUnit.map(unit => ({
        unit: unit.unit,
        name: unit.name,
        factor: unit.factor,
        price: unit.price.sale
      }))

      return modifiedProduct
    })


    // const io = getSocket()
    // io.emit('product/all', {});

    res.status(200).json({
      status: '200',
      message: 'Products fetched successfully!',
      data: products
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '501', message: error.message })
  }
}

exports.getProductSwitch = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { Product } = getModelsByChannel(channel, res, productModel)
    const products = await Product.aggregate([
      {
        $addFields: {
          statusSaleOrder: { $cond: [{ $eq: ['$statusSale', 'Y'] }, 0, 1] }
        }
      },
      { $sort: { statusSaleOrder: 1, groupCode: 1 } },
      { $project: { statusSaleOrder: 0 } } // Remove the helper field from the result
    ])

    // const io = getSocket()
    // io.emit('product/getProductSwitch', {});

    res.status(200).json({
      status: '200',
      message: 'Products fetched successfully!',
      data: products
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '501', message: error.message })
  }
}
exports.getProduct = async (req, res) => {
  try {
    const { type, group, area, orderId, period, brand, size, flavour } = req.body
    const channel = req.headers['x-channel']

    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Stock } = getModelsByChannel(channel, res, stockModel)
    const { Distribution } = getModelsByChannel(channel, res, distributionModel)

    const parseArrayParam = param => {
      if (!param) return []
      try {
        return typeof param === 'string' ? JSON.parse(param) : param
      } catch {
        return param.split(',')
      }
    }

    const parseGram = sizeStr => {
      const match = sizeStr.match(/^([\d.]+)(?:-[A-Z])?\s*(KG|G|g|kg)?/i)
      if (!match) return 0
      const value = parseFloat(match[1])
      const unit = (match[2] || 'G').toUpperCase()
      return unit === 'KG' ? value * 1000 : value
    }

    let products = []
    let stock = []

    if (orderId) {
      const dataWithdraw = await Distribution.findOne({ orderId })
      const productIds = dataWithdraw.listProduct.map(item => item.id)

      products = await Product.find({ id: { $in: productIds } }).lean()

      stock = await Stock.aggregate([
        {
          $match: {
            period: period,
            area: dataWithdraw.area
          }
        },
        { $unwind: '$listProduct' },
        {
          $match: {
            'listProduct.productId': { $in: productIds }
          }
        },
        {
          $group: {
            _id: '$listProduct.productId',
            balanceCtn: { $sum: '$listProduct.balanceCtn' },
            balancePcs: { $sum: '$listProduct.balancePcs' }
          }
        }
      ])
    } else {
      if (!type || !['sale', 'refund', 'withdraw'].includes(type)) {
        return res.status(400).json({
          status: '400',
          message: 'Invalid type! Required: sale, refund, or withdraw.'
        })
      }

      const groupArray = parseArrayParam(group)
      const brandArray = parseArrayParam(brand)
      const sizeArray = parseArrayParam(size)
      const flavourArray = parseArrayParam(flavour)

      const filter = {
        ...(type === 'sale' && { statusSale: 'Y' }),
        ...(type === 'refund' && { statusRefund: 'Y' }),
        ...(type === 'withdraw' && { statusWithdraw: 'Y' })
      }

      const andConditions = []
      if (groupArray.length) andConditions.push({ group: { $in: groupArray } })
      if (brandArray.length) andConditions.push({ brand: { $in: brandArray } })
      if (sizeArray.length) andConditions.push({ size: { $in: sizeArray } })
      if (flavourArray.length) andConditions.push({ flavour: { $in: flavourArray } })
      if (andConditions.length) filter.$and = andConditions

      products = await Product.find(filter).lean()

      stock = await Stock.aggregate([
        {
          $match: {
            period: period,
            area: area
          }
        },
        { $unwind: '$listProduct' },
        {
          $group: {
            _id: '$listProduct.productId',
            balanceCtn: { $sum: '$listProduct.balanceCtn' },
            balancePcs: { $sum: '$listProduct.balancePcs' }
          }
        }
      ])
    }

    if (!products.length) {
      return res.status(404).json({ status: '404', message: 'No products found!' })
    }

const data = products
  .filter(product => {
    if (type === 'withdraw') {
      return product.listUnit?.some(u => u.unit === 'CTN') // ✅ เฉพาะที่มี CTN
    }
    return true // แสดงทุกตัวถ้าไม่ใช่ withdraw
  })
  .map(product => {
    const stockMatch = stock.find(s => s._id === product.id) || {}
    let listUnit = product.listUnit || []

    if (type === 'sale') {
      listUnit = listUnit.map(u => ({ ...u, price: u.price?.sale }))
    } else if (type === 'refund') {
      listUnit = listUnit.map(u => ({ ...u, price: u.price?.refund }))
    } else if (type === 'withdraw') {
      listUnit = listUnit
        .filter(u => u.unit === 'CTN') // ✅ เฉพาะ CTN
        .map(u => ({
          ...u,
          price: u.price?.sale
        }))
    }

    return {
      ...product,
      listUnit,
      qtyCtn: stockMatch.balanceCtn || 0,
      qtyPcs: stockMatch.balancePcs || 0
    }
  })
      .sort((a, b) => {
        if (a.groupCode < b.groupCode) return -1
        if (a.groupCode > b.groupCode) return 1
        return parseGram(a.size) - parseGram(b.size)
      })

    res.status(200).json({
      status: '200',
      message: 'Products fetched successfully!',
      data
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '501', message: error.message })
  }
}


exports.getFilters = async (req, res) => {
  try {
    let { group, brand, size, flavour } = req.body

    const channel = req.headers['x-channel']
    const { Product } = getModelsByChannel(channel, res, productModel)

    const isEmptyArray = arr => Array.isArray(arr) && arr.length === 0
    const isEmptyRequest =
      (!group && !brand && !size && !flavour) ||
      (isEmptyArray(group) &&
        isEmptyArray(brand) &&
        isEmptyArray(size) &&
        isEmptyArray(flavour))

    const allGroups = await Product.aggregate([
      { $match: { group: { $ne: null } } },
      { $group: { _id: '$group' } },
      { $project: { _id: 0, group: '$_id' } },
      { $sort: { group: 1 } }
    ]);



    if (isEmptyRequest) {
      return res.status(200).json({
        status: '200',
        message: 'Filters fetched successfully!',
        data: {
          group: allGroups.map(g => g.group),
          brand: [],
          size: [],
          flavour: []
        }
      })
    }

    let matchCondition = {};

    if (Array.isArray(group) && group.length > 0) {
      matchCondition.group = { $in: group };
    }
    if (Array.isArray(brand) && brand.length > 0) {
      matchCondition.brand = { $in: brand };
    }
    if (Array.isArray(size) && size.length > 0) {
      matchCondition.size = { $in: size };
    }
    if (Array.isArray(flavour) && flavour.length > 0) {
      matchCondition.flavour = { $in: flavour };
    }

    const attributes = await Product.aggregate([
      { $match: matchCondition },
      {
        $group: {
          _id: null,
          brand: { $addToSet: '$brand' },
          size: { $addToSet: '$size' },
          flavour: { $addToSet: '$flavour' }
        }
      },
      { $project: { _id: 0, brand: 1, size: 1, flavour: 1 } }
    ]);

    // ✅ กรอง null ออกจากผลลัพธ์สุดท้ายด้วย
    const clean = arr => (arr || []).filter(item => item !== null)

    // const io = getSocket()
    // io.emit('product/filter', {});


    res.status(200).json({
      status: '200',
      message: 'Filters fetched successfully!',
      data: {
        group: clean(allGroups.map(g => g.group)),
        brand: attributes.length
          ? clean(attributes[0].brand)
          : ['เลือกกลุ่มสินค้า'],
        size: attributes.length
          ? clean(attributes[0].size)
          : ['เลือกกลุ่มสินค้า'],
        flavour: attributes.length
          ? clean(attributes[0].flavour)
          : ['เลือกกลุ่มสินค้า']
      }
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.searchProduct = async (req, res) => {
  try {
    const { search } = req.query
    const channel = req.headers['x-channel']
    const { Product } = getModelsByChannel(channel, res, productModel)
    if (!search) {
      return res.status(400).json({
        status: '400',
        message: 'Search keyword is required!'
      })
    }

    const regex = new RegExp(search, 'i')
    const filter = {
      $or: [
        { id: regex },
        { name: regex },
        { group: regex },
        { brand: regex },
        { size: regex },
        { flavour: regex },
        { type: regex }
      ]
    }

    let products = await Product.find(filter).lean()

    if (!products.length) {
      return res
        .status(404)
        .json({ status: '404', message: 'No products found!' })
    }

    // const io = getSocket()
    // io.emit('product/search', {});

    res.status(200).json({
      status: '200',
      message: 'Search results fetched successfully!',
      data: products
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '501', message: error.message })
  }
}

exports.updateStatus = async (req, res) => {
  try {
    const { id, type, status } = req.body
    const channel = req.headers['x-channel']
    const { Product } = getModelsByChannel(channel, res, productModel)
    if (!id || !type || !status) {
      return res
        .status(400)
        .json({ status: '400', message: 'id, type, status are required!' })
    }
    let product = {}
    if (type === 'sale') {
      product = await Product.findOneAndUpdate(
        { id },
        { $set: { statusSale: status } }
      )
    } else if (type === 'refund') {
      product = await Product.findOneAndUpdate(
        { id },
        { $set: { statusRefund: status } }
      )
    } else if (type === 'withdraw') {
      product = await Product.findOneAndUpdate(
        { id },
        { $set: { statusWithdraw: status } }
      )
    }

    if (!product) {
      return res
        .status(404)
        .json({ status: '404', message: 'product not found!' })
    }

    const io = getSocket()
    io.emit('product/onOff', {
      status: '200',
      message: 'Updated status successfully!'
    });

    res.status(200).json({
      status: '200',
      message: 'Updated status successfully!'
    })
  } catch (error) {
    console.error('Error updating store:', error)
    res.status(500).json({ status: '500', message: 'Server error' })
  }
}

exports.addProduct = async (req, res) => {
  upload(req, res, async err => {
    if (err) {
      return res.status(400).json({ status: '400', message: err.message })
    }
    try {
      if (!req.body.store) {
        return res.status(400).json({
          status: '400',
          message: 'Store data is required'
        })
      }

      const files = req.files
      const store = JSON.parse(req.body.store)
      const types = req.body.types ? req.body.types.split(',') : []

      if (!store.name || !store.address) {
        return res.status(400).json({
          status: '400',
          message: 'Required fields are missing: name, address'
        })
      }

      if (files.length !== types.length) {
        return res.status(400).json({
          status: '400',
          message: 'Number of files and types do not match'
        })
      }

      const existingStores = await Store.find(
        {},
        { _id: 0, __v: 0, idIndex: 0 }
      )
      const fieldsToCheck = [
        'name',
        'taxId',
        'tel',
        'address',
        'district',
        'subDistrict',
        'province',
        'postCode',
        'latitude',
        'longtitude'
      ]

      const similarStores = existingStores
        .map(existingStore => {
          let totalSimilarity = 0
          fieldsToCheck.forEach(field => {
            const similarity = calculateSimilarity(
              store[field]?.toString() || '',
              existingStore[field]?.toString() || ''
            )
            totalSimilarity += similarity
          })

          const averageSimilarity = totalSimilarity / fieldsToCheck.length
          return {
            store: existingStore,
            similarity: averageSimilarity
          }
        })
        .filter(result => result.similarity > 50)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3)

      if (similarStores.length > 0) {
        const sanitizedStores = similarStores.map(item => ({
          store: Object.fromEntries(
            Object.entries(item.store._doc || item.store).filter(
              ([key]) => key !== '_id'
            )
          ),
          similarity: item.similarity.toFixed(2)
        }))
        return res.status(200).json({
          status: '200',
          message: 'similar store',
          data: sanitizedStores
        })
      }

      const uploadedFiles = []
      for (let i = 0; i < files.length; i++) {
        const uploadedFile = await uploadFiles(
          [files[i]],
          path.join(__dirname, '../../public/images/stores'),
          store.area,
          types[i]
        )
        uploadedFiles.push({
          name: uploadedFile[0].name,
          path: uploadedFile[0].fullPath,
          type: types[i]
        })
      }

      const imageList = uploadedFiles

      const policyAgree = {
        status: store.policyConsent?.status || ''
      }
      const approve = {
        status: '19'
      }

      const shippingAddress = Array.isArray(store.shippingAddress)
        ? store.shippingAddress
        : []
      const shipping = shippingAddress.map(ship => ({
        default: ship.default || '',
        address: ship.address || '',
        district: ship.district || '',
        subDistrict: ship.subDistrict || '',
        provinceCode: ship.provinceCode || '',
        postCode: ship.postCode || '',
        latitude: ship.latitude || '',
        longtitude: ship.longtitude || ''
      }))

      const checkIn = {}

      const productData = new Product({
        storeId: '',
        name: store.name,
        taxId: store.taxId,
        tel: store.tel,
        route: store.route,
        type: store.type,
        typeName: store.typeName,
        address: store.address,
        district: store.district,
        subDistrict: store.subDistrict,
        province: store.province,
        provinceCode: store.provinceCode,
        postCode: store.postCode,
        zone: store.zone,
        area: store.area,
        latitude: store.latitude,
        longtitude: store.longtitude,
        lineId: store.lineId,
        note: store.note,
        status: store.status,
        approve: approve,
        policyConsent: policyAgree,
        imageList: imageList,
        shippingAddress: shipping,
        checkIn: checkIn
      })

      await storeData.save()



      res.status(200).json({
        status: '200',
        message: 'Store added successfully'
      })
    } catch (error) {
      console.error('Error saving store to MongoDB:', error)
      res.status(500).json({ status: '500', message: 'Server Error' })
    }
  })
}

exports.addFromERP = async (req, res) => {
  try {
    let pathPhp = ''
    const channel = req.headers['x-channel']
    switch (channel) {
      case 'cash':
        pathPhp = 'ca_api/ca_product.php'
        break
      case 'credit':
        pathPhp = 'cr_api/cr_product.php'
        break
      default:
        break
    }

    const response = await axios.get(
      `http://58.181.206.159:9814/apps_api/${pathPhp}`
    )

    const { Product } = getModelsByChannel(channel, res, productModel)

    if (!response.data || !Array.isArray(response.data)) {
      return res.status(400).json({
        status: 400,
        message: 'Invalid response data from external API'
      })
    }

    data = []

    for (const listProduct of response.data) {
      const productId = listProduct.id

      const existingProduct = await Product.findOne({ id: productId })
      if (existingProduct) {
        console.log(`Product ID ${productId} already exists. Skipping.`)
        continue
      }

      const itemConvertResponse = await axios.post(
        'http://192.168.2.97:8383/M3API/ItemManage/Item/getItemConvertItemcode',
        { itcode: productId }
      )

      // console.log("itemConvertResponse",itemConvertResponse)
      const unitData = itemConvertResponse.data
      // console.log(JSON.stringify(listProduct, null, 2));

      const listUnit = listProduct.unitList
        .map(unit => {
          const matchingUnit = unitData[0]?.type.find(u => u.unit === unit.unit)
          return {
            unit: unit.unit,
            name: unit.name,
            factor: matchingUnit ? matchingUnit.factor : 1,
            price: {
              sale: unit.pricePerUnitSale,
              refund: unit.pricePerUnitRefund
            }
          }
        })
        .sort((a, b) => b.factor - a.factor)
      // console.log(JSON.stringify(listUnit, null, 2));

      const newProduct = new Product({
        id: listProduct.id,
        name: listProduct.name,
        groupCode: listProduct.groupCode,
        group: listProduct.group,
        brandCode: listProduct.brandCode,
        brand: listProduct.brand,
        size: listProduct.size,
        flavourCode: listProduct.flavourCode,
        flavour: listProduct.flavour,
        type: listProduct.type,
        weightGross: listProduct.weightGross,
        weightNet: listProduct.weightNet,
        statusSale: listProduct.statusSale,
        statusRefund: listProduct.statusRefund,
        statusWithdraw: listProduct.statusWithdraw,
        listUnit: listUnit
      })
      // console.log(newProduct)
      await newProduct.save()
      data.push(newProduct)
    }
    res.status(200).json({
      status: 200,
      message: 'Products added successfully'
      // data:data
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({
      status: 500,
      message: e.message
    })
  }
}
exports.addFromERPnew = async (req, res) => {
  const channel = req.headers['x-channel']
  const result = await productQuery(channel)

  const { Product } = getModelsByChannel(channel, res, productModel)

  // if (!result || !Array.isArray(result)) {
  //   return res.status(400).json({
  //     status: 400,
  //     message: 'Invalid response data from external API'
  //   })
  // }
  // console.log(result)
  data = []

  for (const listProduct of result) {
    const productId = listProduct.id

    const existingProduct = await Product.findOne({ id: productId })
    if (existingProduct) {
      // console.log(`Product ID ${productId} already exists. Skipping.`)
      continue
    }
    const itemConvertResponse = await axios.post(
      'http://192.168.2.97:8383/M3API/ItemManage/Item/getItemConvertItemcode',
      { itcode: productId }
    )

    // console.log("itemConvertResponse",itemConvertResponse)
    const unitData = itemConvertResponse.data
    // console.log(JSON.stringify(listProduct, null, 2));

    const listUnit = listProduct.unitList
      .map(unit => {
        // console.log(unit)
        const matchingUnit = unitData[0]?.type.find(u => u.unit === unit.unit)

        return {
          unit: unit.unit,
          name: unit.name,
          factor: matchingUnit ? matchingUnit.factor : 1,
          price: {
            sale: unit.pricePerUnitSale,
            refund: unit.pricePerUnitRefund,
            refundDmg: unit.pricePerUnitRefundDamage,
            change: unit.pricePerUnitChange
          }
        }
      })
      .sort((a, b) => b.factor - a.factor)
    // console.log("listProduct.weightGross", listProduct.weightGross.length);

    const newProduct = new Product({
      id: listProduct.id,
      name: listProduct.name,
      groupCode: listProduct.groupCode,
      group: listProduct.group,
      groupCodeM3: listProduct.groupCodeM3,
      groupM3: listProduct.groupM3,
      brandCode: listProduct.brandCode,
      brand: listProduct.brand,
      size: listProduct.size,
      flavourCode: listProduct.flavourCode,
      flavour: listProduct.flavour,
      type: listProduct.type,
      weightGross: listProduct.weightGross ?? 0,
      weightNet: listProduct.weightNet ?? 0,
      statusSale: listProduct.statusSale,
      statusRefund: listProduct.statusRefund,
      statusRefundDmg: listProduct.statusRefundDamage,
      statusWithdraw: listProduct.statusWithdraw,
      listUnit: listUnit
    })
    // console.log(newProduct)
    await newProduct.save()
    data.push(newProduct)
  }

  const io = getSocket()
  io.emit('product/addFromERPnew', {});


  res.status(200).json({
    status: 200,
    message: 'Products added successfully',
    data: data
  })
}

exports.groupProductId = async (req, res) => {
  const channel = req.headers['x-channel']
  const { Product } = getModelsByChannel(channel, res, productModel)
  const data = await Product.aggregate([
    {
      $group: {
        _id: {
          id: '$id',
          name: '$name'
        }
      }
    },
    {
      $project: {
        _id: 0,
        id: '$_id.id',
        name: '$_id.name'
      }
    }
  ])



  res.status(200).json({
    status: 200,
    message: 'sucess',
    data: data
  })
}

exports.groupBrandId = async (req, res) => {
  const channel = req.headers['x-channel']
  const { Product } = getModelsByChannel(channel, res, productModel)
  const data = await Product.aggregate([
    {
      $group: {
        _id: {
          id: '$brandCode',
          name: '$brand'
        }
      }
    },
    {
      $project: {
        _id: 0,
        brandId: '$_id.id',
        brandName: '$_id.name'
      }
    }
  ])



  res.status(200).json({
    status: 200,
    message: 'sucess',
    data: data
  })
}

exports.groupSize = async (req, res) => {
  const channel = req.headers['x-channel']
  const { Product } = getModelsByChannel(channel, res, productModel)
  const data = await Product.aggregate([
    {
      $group: {
        _id: {
          id: '$size'
        }
      }
    },
    {
      $project: {
        _id: 0,
        size: '$_id.id'
      }
    }
  ])



  res.status(200).json({
    status: 200,
    message: 'sucess',
    data: data
  })
}

exports.groupFlavourId = async (req, res) => {
  const channel = req.headers['x-channel']
  const { Product } = getModelsByChannel(channel, res, productModel)
  const data = await Product.aggregate([
    {
      $group: {
        _id: {
          id: '$flavourCode',
          name: '$flavour'
        }
      }
    },
    {
      $project: {
        _id: 0,
        flavourId: '$_id.id',
        flavourName: '$_id.name'
      }
    }
  ])



  res.status(200).json({
    status: 200,
    message: 'sucess',
    data: data
  })
}

exports.groupByFilter = async (req, res) => {
  const { size, brand, flavour, unit } = req.body
  const channel = req.headers['x-channel']
  const { Product } = getModelsByChannel(channel, res, productModel)

  let query = {}
  if (size) query.size = size
  if (brand) query.brand = brand
  if (flavour) query.flavour = flavour

  let queryUnit = {}
  if (unit) queryUnit['listUnit.name'] = unit

  const dataProduct = await Product.aggregate([
    { $match: query },
    { $unwind: { path: '$listUnit' } },
    { $match: queryUnit },
    { $match: { group: { $nin: ['', null] } } },
    {
      $group: {
        _id: '$group'
      }
    },
    {
      $project: {
        _id: 0,
        group: '$_id'
      }
    },
    {
      $sort: {
        group: 1
      }
    }
  ])

  if (dataProduct.length === 0) {
    return res.status(404).json({
      status: 404,
      message: 'Not found group'
    })
  }



  res.status(200).json({
    status: 200,
    message: 'sucess',
    data: dataProduct
  })
}

exports.flavourByFilter = async (req, res) => {
  const { size, brand, group, unit } = req.body
  const channel = req.headers['x-channel']
  const { Product } = getModelsByChannel(channel, res, productModel)

  let query = {}
  if (size) query.size = size
  if (brand) query.brand = brand
  if (group) query.group = group

  let queryUnit = {}
  if (unit) queryUnit['listUnit.name'] = unit

  const dataProduct = await Product.aggregate([
    { $match: query },
    { $unwind: { path: '$listUnit' } },
    { $match: queryUnit },
    { $match: { flavour: { $nin: ['', null] } } },
    {
      $group: {
        _id: '$flavour'
      }
    },
    {
      $project: {
        _id: 0,
        flavour: '$_id'
      }
    },
    {
      $sort: {
        flavour: 1
      }
    }
  ])

  if (dataProduct.length === 0) {
    return res.status(404).json({
      status: 404,
      message: 'Not found flavour'
    })
  }



  res.status(200).json({
    status: 200,
    message: 'sucess',
    data: dataProduct
  })
}

exports.sizeByFilter = async (req, res) => {
  const { flavour, brand, group, unit } = req.body
  const channel = req.headers['x-channel']
  const { Product } = getModelsByChannel(channel, res, productModel)

  let query = {}
  if (flavour) query.flavour = flavour
  if (brand) query.brand = brand
  if (group) query.group = group

  let queryUnit = {}
  if (unit) queryUnit['listUnit.name'] = unit

  const dataProduct = await Product.aggregate([
    { $match: query },
    { $unwind: { path: '$listUnit' } },
    { $match: queryUnit },
    { $match: { size: { $nin: ['', null] } } },
    {
      $group: {
        _id: '$size'
      }
    },
    {
      $project: {
        _id: 0,
        size: '$_id'
      }
    },
    {
      $sort: {
        size: 1
      }
    }
  ])

  if (dataProduct.length === 0) {
    return res.status(404).json({
      status: 404,
      message: 'Not found size'
    })
  }



  res.status(200).json({
    status: 200,
    message: 'sucess',
    data: dataProduct
  })
}

exports.brandByFilter = async (req, res) => {
  const { flavour, size, group, unit } = req.body
  const channel = req.headers['x-channel']
  const { Product } = getModelsByChannel(channel, res, productModel)

  let query = {}
  if (flavour) query.flavour = flavour
  if (size) query.size = size
  if (group) query.group = group

  let queryUnit = {}
  if (unit) queryUnit['listUnit.name'] = unit

  const dataProduct = await Product.aggregate([
    { $match: query },
    { $unwind: { path: '$listUnit' } },
    { $match: queryUnit },
    { $match: { brand: { $nin: ['', null] } } },
    {
      $group: {
        _id: '$brand'
      }
    },
    {
      $project: {
        _id: 0,
        brand: '$_id'
      }
    },
    {
      $sort: {
        brand: 1
      }
    }
  ])

  if (dataProduct.length === 0) {
    return res.status(404).json({
      status: 404,
      message: 'Not found brand'
    })
  }

  res.status(200).json({
    status: 200,
    message: 'sucess',
    data: dataProduct
  })
}

exports.unitByFilter = async (req, res) => {
  const { flavour, brand, group, size } = req.body
  const channel = req.headers['x-channel']
  const { Product } = getModelsByChannel(channel, res, productModel)

  let query = {}
  if (flavour) query.flavour = flavour
  if (brand) query.brand = brand
  if (group) query.group = group
  if (size) query.size = size
  // let queryUnit = {};
  // if (unit) queryUnit['listUnit.name'] = unit;

  const dataProduct = await Product.aggregate([
    { $match: query },
    { $unwind: { path: '$listUnit' } },
    // { $match: queryUnit },
    { $match: { 'listUnit.unit': { $nin: ['', null] } } },
    {
      $group: {
        _id: '$listUnit.unit'
      }
    },
    {
      $project: {
        _id: 0,
        unit: '$_id'
      }
    },
    {
      $sort: {
        unit: 1
      }
    }
  ])

  if (dataProduct.length === 0) {
    return res.status(404).json({
      status: 404,
      message: 'Not found unit'
    })
  }

  res.status(200).json({
    status: 200,
    message: 'sucess',
    data: dataProduct
  })
}

exports.addProductimage = async (req, res) => {
  const channel = req.headers['x-channel']
  const { Product } = getModelsByChannel(channel, res, productModel)

  const productIds = await Product.find().select('id -_id')

  // อัปเดตแต่ละ product ทีละรายการ (ถ้าต้องการใช้ id เองใน URL)
  for (const product of productIds) {
    const id = product.id
    await Product.updateMany(
      { id: id },
      {
        $set: {
          image: `https://apps.onetwotrading.co.th/images/products/${id}.webp`
        }
      }
    )
  }

  const io = getSocket()
  io.emit('product/addProductimage', {});

  res.status(200).json({
    status: 200,
    message: 'sucess'
    // data: productId
  })
}
