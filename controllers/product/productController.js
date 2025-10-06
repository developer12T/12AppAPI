const axios = require('axios')
const { Product } = require('../../models/cash/product')
const fs = require('fs')
const path = require('path')
const productModel = require('../../models/cash/product')
const productUATModel = require('../../models/cash/productUAT')
const orderModel = require('../../models/cash/sale')
const stockModel = require('../../models/cash/stock')
const { getSocket } = require('../../socket')
const { getModelsByChannel } = require('../../middleware/channel')
const { productQuery } = require('../../controllers/queryFromM3/querySctipt')
const { group } = require('console')
const { flatMap } = require('lodash')
const distributionModel = require('../../models/cash/distribution')
const { MongoClient } = require('mongodb')
const { period } = require('../../utilities/datetime')
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
    const { type, group, area, orderId, period, brand, size, flavour, limit } =
      req.body
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
      if (flavourArray.length)
        andConditions.push({ flavour: { $in: flavourArray } })
      if (andConditions.length) filter.$and = andConditions

      if (limit === true) {
        const TOP_N = 20

        products = await Product.find(filter)
          .select(
            'id name group groupCode size brand flavour listUnit statusSale statusRefund statusWithdraw'
          )
          .limit(TOP_N)
          .lean()
        const productsId = products.flatMap(item => item.id)

        const ids = [
          ...new Set(
            (productsId || []).map(x => String(x).trim()).filter(Boolean)
          )
        ]

        stock = await Stock.aggregate(
          [
            // ตัดเอกสารตามช่วงที่สนใจก่อน
            { $match: { period, area, 'listProduct.productId': { $in: ids } } },

            // เอาเฉพาะ array ที่ใช้
            { $project: { _id: 0, listProduct: 1 } },
            { $unwind: '$listProduct' },

            // เตรียมฟิลด์ให้เทียบตรงและเป็นตัวเลข
            {
              $set: {
                productId: { $trim: { input: '$listProduct.productId' } },
                balancePcs: {
                  $toDouble: { $ifNull: ['$listProduct.balancePcs', 0] }
                },
                balanceCtn: {
                  $toDouble: { $ifNull: ['$listProduct.balanceCtn', 0] }
                }
              }
            },

            // กรองเฉพาะ product ที่อยู่ใน ids (หลัง trim)
            { $match: { productId: { $in: ids } } },

            // รวบยอดต่อ productId
            {
              $group: {
                _id: '$productId',
                balancePcs: { $sum: '$balancePcs' },
                balanceCtn: { $sum: '$balanceCtn' }
              }
            },

            // รูปแบบผลลัพธ์
            { $project: { _id: '$_id', balancePcs: 1, balanceCtn: 1 } }
          ],
          { allowDiskUse: true }
        )
      } else {
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
    }

    if (!products.length) {
      return res
        .status(404)
        .json({ status: '404', message: 'No products found!' })
    }
    // console.log(products)
    // console.log(stock)
    const data = products
      // .filter(product => {
      //   if (type === 'withdraw') {
      //     return product.listUnit?.some(u => u.unit === 'CTN') // ✅ เฉพาะที่มี CTN
      //   }
      //   return true // แสดงทุกตัวถ้าไม่ใช่ withdraw
      // })
      // console.log(stock)

      .map(product => {
        const stockMatch = stock.find(s => s._id === product.id) || {}
        let listUnit = product.listUnit || []
        // console.log(stockMatch)
        if (type === 'sale') {
          listUnit = listUnit.map(u => ({ ...u, price: u.price?.sale }))
        } else if (type === 'refund') {
          listUnit = listUnit.map(u => ({ ...u, price: u.price?.refund }))
        } else if (type === 'withdraw') {
          listUnit = listUnit
            // .filter(u => u.unit === 'CTN') // ✅ เฉพาะ CTN
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
    ])

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

    let matchCondition = {}

    if (Array.isArray(group) && group.length > 0) {
      matchCondition.group = { $in: group }
    }
    if (Array.isArray(brand) && brand.length > 0) {
      matchCondition.brand = { $in: brand }
    }
    if (Array.isArray(size) && size.length > 0) {
      matchCondition.size = { $in: size }
    }
    if (Array.isArray(flavour) && flavour.length > 0) {
      matchCondition.flavour = { $in: flavour }
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
    ])

    // ✅ กรอง null ออกจากผลลัพธ์สุดท้ายด้วย
    const clean = arr => (arr || []).filter(item => item !== null)

    const PLACEHOLDER = ['เลือกกลุ่มสินค้า'];
    const collatorTH = new Intl.Collator('th-TH', { numeric: true, sensitivity: 'base' });

    function cleanList(list) {
      const arr = Array.isArray(list) ? list : [];
      const filtered = arr
        .map(v => (typeof v === 'string' ? v.trim() : v))
        .filter(v => v !== undefined && v !== null && v !== '' && v !== 'null');
      if (!filtered.length) return PLACEHOLDER;
      const unique = [...new Set(filtered)];
      return unique.sort(collatorTH.compare);
    }

    const firstAttr = attributes[0] ?? {}; // ปลอดภัยกว่า attributes.length เช็คทีเดียว

    function sortSizesAscGFirst(list) {
      const UNIT_PRIORITY = { G: 0, KG: 1, L: 2 }; // อยากให้ L ไปท้ายสุดกว่าก็ปรับเลขได้
      const coll = new Intl.Collator('th-TH', { numeric: true, sensitivity: 'base' });

      const parse = (s) => {
        const up = String(s || '').toUpperCase().trim();

        // ดึงเลขตัวหน้า (รองรับทศนิยม)
        const m = up.match(/^(\d+(?:\.\d+)?)/);
        const num = m ? Number(m[1]) : NaN;

        // หา unit (กัน KG ไปชน G)
        const isKG = /\bKG\b/.test(up);
        const isG = !isKG && /\bG\b/.test(up);
        const isL = /\bL\b/.test(up);

        const unit = isKG ? 'KG' : isG ? 'G' : isL ? 'L' : 'OTHER';
        const priority = UNIT_PRIORITY[unit] ?? 3;

        // แปลงเป็นฐานเดียวเพื่อเทียบขนาด (G และ L→mL)
        let normalized = Number.POSITIVE_INFINITY;
        if (Number.isFinite(num)) {
          if (unit === 'G') normalized = num;           // g
          else if (unit === 'KG') normalized = num * 1000; // kg → g
          else if (unit === 'L') normalized = num * 1000;  // L → mL (ถ้าอยากแยกกลุ่มน้ำ/ของแข็ง ก็พอแยกด้วย priority อยู่แล้ว)
        }

        return { s, unit, priority, normalized };
      };

      // คืน array ใหม่ (ไม่แก้ต้นฉบับ)
      return [...list].sort((a, b) => {
        const A = parse(a);
        const B = parse(b);
        return (
          A.priority - B.priority ||                 // G ก่อน → KG → L → อื่น ๆ
          A.normalized - B.normalized ||             // จากน้อยไปมากภายในหน่วย
          coll.compare(A.s, B.s)                     // tie-break ตามตัวอักษร
        );
      });
    }



    const data = {
      group: cleanList(allGroups.map(g => g?.group)),
      brand: cleanList(firstAttr.brand),
      size: sortSizesAscGFirst(cleanList(firstAttr.size)),
      flavour: cleanList(firstAttr.flavour).sort(
        (a, b) => String(a).localeCompare(String(b), 'th-TH', { numeric: true, sensitivity: 'base' })
      )
    };

    res.status(200).json({
      status: 200,
      message: 'Filters fetched successfully!',
      data
    });
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
    })

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
  try {
    const {
      id,
      name,
      group,
      groupCode,
      groupCodeM3,
      groupM3,
      brand,
      brandCode,
      size,
      flavour,
      flavourCode,
      type,
      image,
      weightGross,
      weightNet,
      statusSale,
      statusWithdraw,
      statusRefund,
      listUnit
    } = req.body
    const channel = req.headers['x-channel']
    const { Product } = getModelsByChannel(channel, res, productModel)
    const newProduct = new Product({
      id,
      name,
      group,
      groupCode,
      groupCodeM3,
      groupM3,
      brand,
      brandCode,
      size,
      flavour,
      flavourCode,
      type,
      image,
      weightGross,
      weightNet,
      statusSale,
      statusWithdraw,
      statusRefund,
      listUnit
    })
    await newProduct.save()
    res.status(200).json({
      status: 200,
      message: 'Add Product successful!'
    })
  } catch (error) {
    console.error('Error updating store:', error)
    res.status(500).json({ status: '500', message: 'Server error' })
  }
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
  io.emit('product/addFromERPnew', {})

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
  try {
    const channel = req.headers['x-channel']
    const { Product } = getModelsByChannel(channel, res, productModel)

    const regexNumber = new RegExp('^(\\d+(?:\\.\\d+)?)')

    const data = await Product.aggregate([
      { $group: { _id: { id: '$size' } } },
      { $project: { _id: 0, size: '$_id.id' } },

      // 1) เตรียม string + หาเลข
      {
        $addFields: {
          _sizeStr: { $ifNull: ['$size', ''] },
          _upper: { $toUpper: { $ifNull: ['$size', ''] } },
          _trimmed: { $trim: { input: { $ifNull: ['$size', ''] } } },
          _match: { $regexFind: { input: { $trim: { input: { $ifNull: ['$size', ''] } } }, regex: regexNumber } }
        }
      },
      // 2) แปลงเลข + หา unit (ทำใน stage แยก)
      {
        $addFields: {
          _num: {
            $convert: { input: '$_match.match', to: 'double', onError: null, onNull: null }
          },
          unit: {
            $switch: {
              branches: [
                { case: { $regexMatch: { input: '$_upper', regex: /KG/ } }, then: 'KG' },
                { case: { $regexMatch: { input: '$_upper', regex: / G/ } }, then: 'G' },
                { case: { $regexMatch: { input: '$_upper', regex: / L/ } }, then: 'L' }
              ],
              default: null
            }
          },
          hasNumber: { $cond: [{ $ne: ['$_match', null] }, 1, 0] }
        }
      },
      // 3) คำนวณ normalizedSize + unitPriority (อ้าง unit ได้ชัวร์)
      {
        $addFields: {
          normalizedSize: {
            $switch: {
              branches: [
                { case: { $eq: ['$unit', 'KG'] }, then: { $multiply: ['$_num', 1000] } }, // KG -> g
                { case: { $eq: ['$unit', 'G'] }, then: '$_num' },                         // G  -> g
                { case: { $eq: ['$unit', 'L'] }, then: { $multiply: ['$_num', 1000] } }  // L  -> mL
              ],
              default: null
            }
          },
          unitPriority: {
            $switch: {
              branches: [
                { case: { $eq: ['$unit', 'G'] }, then: 0 },
                { case: { $eq: ['$unit', 'KG'] }, then: 1 },
                { case: { $eq: ['$unit', 'L'] }, then: 2 }
              ],
              default: 3
            }
          }
        }
      },

      // 4) เรียง: มีตัวเลขก่อน → G ก่อน KG ก่อน L → ค่าตาม normalized → แล้วค่อยชื่อ
      { $sort: { hasNumber: -1, unitPriority: 1, normalizedSize: 1, size: 1 } },

      // 5) ส่งออก
      { $project: { size: 1 } }
    ])

    res.status(200).json({ status: 200, message: 'success', data })
  } catch (error) {
    res.status(500).json({ status: 500, message: error.message })
  }
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
    },
    {
      $sort: {
        flavourName: 1
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

  // console.log(dataProduct)

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
  io.emit('product/addProductimage', {})

  res.status(200).json({
    status: 200,
    message: 'sucess'
    // data: productId
  })
}


exports.productUpdatePrice = async (req, res) => {
  const channel = req.headers['x-channel']
  const { Product } = getModelsByChannel(channel, res, productModel)

  const productData = await Product.find().select('id')

  const productId = productData.flatMap(item => item.id)

  const product96 = await productQuery(channel)
  // console.log(product96)
  const data = []
  for (item of product96) {


    for (unit of item.unitList) {
      const dataTran = await Product.findOneAndUpdate(
        {
          id: item.id,
          'listUnit.unit': unit.unit
        },
        {
          $set: {
            'listUnit.$.price.sale': unit.pricePerUnitSale,
            'listUnit.$.price.refund': unit.pricePerUnitRefund,
            'listUnit.$.price.refundDmg': unit.pricePerUnitRefundDamage,
            'listUnit.$.price.change': unit.pricePerUnitChange
          }
        },
        { new: true }
      )
      // console.log(dataTran)
      data.push(dataTran)
    }
  }

  res.status(200).json({
    status: 200,
    message: 'success',
    data: data
  })


}

exports.productCheckPrice = async (req, res) => {

  const channel = req.headers['x-channel']
  const { Product } = getModelsByChannel(channel, res, productModel)
  const { ProductUAT } = getModelsByChannel(channel, res, productUATModel)

  const productUatData = await ProductUAT.find()
  const productPrdData = await Product.find()

  const dataSet = new Set()

  for (const item of productPrdData) {
    const uatDetail = productUatData.find(o => o.id === item.id)

    for (const unit of item.listUnit) {
      const uatDetailUnit = uatDetail?.listUnit.find(o => o.unit === unit.unit)
      const salePrd = unit.price.sale
      const saleUat = uatDetailUnit?.price?.sale

      if (salePrd !== saleUat) {
        dataSet.add(item.id)
      }
    }
  }

  const data = Array.from(dataSet)


  res.status(200).json({
    status: 200,
    message: 'success',
    data: data
  })
}

exports.checkPriceProductOrder = async (req, res) => {

  const channel = req.headers['x-channel']
  const { Product } = getModelsByChannel(channel, res, productModel)
  const { ProductUAT } = getModelsByChannel(channel, res, productUATModel)

  const { Order } = getModelsByChannel(channel, res, orderModel)

  const dataProduct = await Product.find()
  const dataProductUAT = await ProductUAT.find()
  const orderData = await Order.find({ period: '202510' })


  let productId = []

  for (item of orderData) {
    for (i of item.listProduct) {
      const product = dataProduct.find(o => o.id === i.id)
      // const productUAT = dataProductUAT.find(o => o.id === i.id)
      const productUnit = product.listUnit.find(o => o.unit === i.unit)
      // const productUATUnit = product.listUnit.find(o => o.unit === i.unit)

      if (i.price != productUnit.price.sale) {
        productId.push(i.id)
      }
    }
  }


  res.status(200).json({
    status: 200,
    message: 'sucess',
    data: productId
  })

}