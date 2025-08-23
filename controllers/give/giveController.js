// const { Givetype, Giveaways } = require('../../models/cash/give')
// const { Cart } = require('../../models/cash/cart')
// const { User } = require('../../models/cash/user')
const {
  generateGiveawaysId,
  generateGivetypeId
} = require('../../utilities/genetateId')
const { getProductGive, getStoreGive } = require('./giveProduct')
const { summaryGive } = require('../../utilities/summary')
const { rangeDate } = require('../../utilities/datetime')
const { period, previousPeriod } = require('../../utilities/datetime')
const productModel = require('../../models/cash/product')
const { getSocket } = require('../../socket')
const stockModel = require('../../models/cash/stock')
const giveawaysModel = require('../../models/cash/give')
const cartModel = require('../../models/cash/cart')
const userModel = require('../../models/cash/user')
const { getModelsByChannel } = require('../../middleware/channel')
const { to2, updateStockMongo } = require('../../middleware/order')
const { formatDateTimeToThai } = require('../../middleware/order')
const { create } = require('lodash')
const path = require('path')
const multer = require('multer')
const upload = multer({ storage: multer.memoryStorage() }).single('image')
const { uploadFiles } = require('../../utilities/upload')
const xlsx = require('xlsx')
const os = require('os')
const fs = require('fs')

exports.addGiveType = async (req, res) => {
  try {
    const {
      name,
      description,
      type,
      remark,
      dept,
      applicableTo,
      conditions,
      status
    } = req.body

    const channel = req.headers['x-channel']
    const { Givetype } = getModelsByChannel(channel, res, giveawaysModel)

    if (!name || !type || !remark || !dept) {
      return res
        .status(400)
        .json({ status: 400, message: 'Missing required fields!' })
    }

    const giveId = await generateGivetypeId(channel, res)

    const newPromotion = new Givetype({
      giveId,
      name,
      description,
      type,
      remark,
      dept,
      applicableTo,
      conditions,
      status: 'active'
    })

    newPromotion.createdAt = new Date()
    await newPromotion.save()

    const io = getSocket()
    io.emit('give/addGiveType', {
      status: 201,
      message: 'Give type created successfully!',
      data: newPromotion
    })

    res.status(201).json({
      status: 201,
      message: 'Give type created successfully!',
      data: newPromotion
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getGiveType = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { Givetype } = getModelsByChannel(channel, res, giveawaysModel)

    const givetypes = await Givetype.find({}).select('-_id giveId name').lean()

    if (!givetypes || givetypes.length === 0) {
      return res.status(404).json({
        status: 404,
        message: 'No give types found!',
        data: []
      })
    }

    // const io = getSocket()
    // io.emit('give/getGiveType', {});

    res.status(200).json({
      status: 200,
      message: 'Successful!',
      data: givetypes
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getGiveProductFilter = async (req, res) => {
  try {
    const { area, giveId, group, brand, size, flavour } = req.body
    const channel = req.headers['x-channel']

    if (!giveId) {
      return res.status(400).json({
        status: 400,
        message: 'area and giveId are required!'
      })
    }

    const products = await getProductGive(giveId, area, channel, res)

    if (!products.length) {
      return res.status(404).json({
        status: 404,
        message: 'No products found for the given giveId and area',
        data: []
      })
    }

    const isEmptyArray = arr => Array.isArray(arr) && arr.length === 0

    if (
      isEmptyArray(group) &&
      isEmptyArray(brand) &&
      isEmptyArray(size) &&
      isEmptyArray(flavour)
    ) {
      const uniqueGroups = [...new Set(products.map(p => p.group))]
      const uniqueBrands = [...new Set(products.map(p => p.brand))]
      const uniqueSizes = [...new Set(products.map(p => p.size))]
      const uniqueflavours = [...new Set(products.map(p => p.flavour))]

      return res.status(200).json({
        status: 200,
        message: 'Successfully fetched product groups!',
        data: {
          group: uniqueGroups,
          brand: uniqueBrands,
          size: uniqueSizes,
          flavour: uniqueflavours
        }
      })
    }

    let filteredProducts = products

    if (!isEmptyArray(group)) {
      filteredProducts = filteredProducts.filter(p => group.includes(p.group))
    }
    if (!isEmptyArray(brand)) {
      filteredProducts = filteredProducts.filter(p => brand.includes(p.brand))
    }
    if (!isEmptyArray(size)) {
      filteredProducts = filteredProducts.filter(p => size.includes(p.size))
    }
    if (!isEmptyArray(flavour)) {
      filteredProducts = filteredProducts.filter(p =>
        flavour.includes(p.flavour)
      )
    }

    if (!filteredProducts.length) {
      return res.status(404).json({
        status: 404,
        message: 'No products match the given filters',
        data: []
      })
    }
    const groupedData = {
      group: [...new Set(filteredProducts.map(p => p.group))],
      brand: [...new Set(filteredProducts.map(p => p.brand))].filter(Boolean),
      size: [...new Set(filteredProducts.map(p => p.size))].filter(Boolean),
      flavour: [...new Set(filteredProducts.map(p => p.flavour))].filter(
        Boolean
      )
    }

    // const io = getSocket()
    // io.emit('give/getGiveProductFilter', {});

    res.status(200).json({
      status: 200,
      message: 'Successfully fetched give product filters!',
      data: groupedData
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getGiveStoreFilter = async (req, res) => {
  try {
    const { area, giveId } = req.query
    const channel = req.headers['x-channel']
    const store = await getStoreGive(giveId, area, channel, res)

    // const io = getSocket()
    // io.emit('give/getGiveStoreFilter', {});

    res.status(200).json({
      status: 200,
      message: 'Successfully fetched give store filters!',
      data: store
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}
const orderTimestamps = {}
exports.checkout = async (req, res) => {
  try {
    const {
      type,
      area,
      period,
      storeId,
      giveId,
      note,
      latitude,
      longitude,
      shipping
    } = req.body
    const channel = req.headers['x-channel']
    const { Cart } = getModelsByChannel(channel, res, cartModel)
    const { User } = getModelsByChannel(channel, res, userModel)
    const { Product } = getModelsByChannel(channel, res, productModel)

    const { Givetype } = getModelsByChannel(channel, res, giveawaysModel)
    const { Giveaway } = getModelsByChannel(channel, res, giveawaysModel)
    const { Stock, StockMovementLog, StockMovement } = getModelsByChannel(
      channel,
      res,
      stockModel
    )
    const now = Date.now()
    const lastUpdate = orderTimestamps[storeId] || 0
    const ONE_MINUTE = 60 * 1000

    if (now - lastUpdate < ONE_MINUTE) {
      return res.status(429).json({
        status: 429,
        message:
          'This order was updated less than 1 minute ago. Please try again later!'
      })
    }
    orderTimestamps[storeId] = now

    if (!type || !area || !storeId || !giveId) {
      return res
        .status(400)
        .json({ status: 400, message: 'Missing required fields!' })
    }

    const cart = await Cart.findOne({ type, area, storeId })
    if (!cart || cart.listProduct.length === 0) {
      return res.status(404).json({ status: 404, message: 'Cart is empty!' })
    }

    const sale = await User.findOne({ area }).select(
      'firstName surName warehouse tel saleCode salePayer'
    )
    if (!sale) {
      return res
        .status(404)
        .json({ status: 404, message: 'Sale user not found!' })
    }

    const give = await Givetype.findOne({ giveId }).select(
      '-_id giveId name type remark dept'
    )
    if (!give) {
      return res
        .status(404)
        .json({ status: 404, message: 'Give type not found!' })
    }

    const orderId = await generateGiveawaysId(
      area,
      sale.warehouse,
      channel,
      res
    )

    const summary = await summaryGive(cart, channel, res)

    const newOrder = new Giveaway({
      type,
      orderId,
      giveInfo: give,
      sale: {
        saleCode: sale.saleCode,
        salePayer: sale.salePayer,
        name: `${sale.firstName} ${sale.surName}`,
        tel: sale.tel || '',
        warehouse: sale.warehouse
      },
      store: {
        storeId: summary.store.storeId,
        name: summary.store.name,
        type: summary.store.type,
        address: summary.store.address,
        taxId: summary.store.taxId,
        tel: summary.store.tel,
        area: summary.store.area,
        zone: summary.store.zone
      },
      note,
      latitude,
      longitude,
      status: 'pending',
      statusTH: 'รอนำเข้า',
      listProduct: summary.listProduct,
      totalVat: summary.totalVat,
      totalExVat: summary.totalExVat,
      total: summary.total,
      shipping: shipping,
      createdBy: sale.username,
      period: period
    })

    // console.log(newOrder.store.area)
    // if (!newOrder.store.area) {
    //   return res.status(400).json({
    //     status: 400,
    //     message: 'Not found store'
    //   })
    // }

    const calStock = {
      // storeId: refundOrder.store.storeId,
      orderId: newOrder.orderId,
      area: newOrder.store.area,
      saleCode: newOrder.sale.saleCode,
      period: period,
      warehouse: newOrder.sale.warehouse,
      status: 'pending',
      statusTH: 'รอนำเข้า',
      action: 'Give',
      type: 'Give',
      product: newOrder.listProduct.map(u => {
        return {
          id: u.id,
          unit: u.unit,
          qty: u.qty,
          statusMovement: 'OUT'
        }
      })
    }

    const productQty = calStock.product.map(u => ({
      id: u.id,
      unit: u.unit,
      qty: u.qty
    }))

    // 🟢 ถ้าอนุมัติ ให้ updateStock 'give'
    for (const item of productQty) {
      const updateResult = await updateStockMongo(
        item,
        newOrder.store.area,
        period,
        'give',
        channel,
        res
      )
      if (updateResult) return
    }

    const createdMovement = await StockMovement.create({
      ...calStock
    })

    await StockMovementLog.create({
      ...calStock,
      refOrderId: createdMovement._id
    })

    await newOrder.save()
    await Cart.deleteOne({ type, area, storeId })

    const io = getSocket()
    io.emit('give/checkout', {
      status: 200,
      message: 'Checkout successful!',
      data: newOrder
    })

    res.status(200).json({
      status: 200,
      message: 'Checkout successful!',
      data: newOrder
      // data: { orderId, total: summary.total }
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getOrder = async (req, res) => {
  try {
    const { type, area, store, period } = req.query
    let response = []

    const channel = req.headers['x-channel']
    const { Giveaway } = getModelsByChannel(channel, res, giveawaysModel)

    if (!type || !period) {
      return res
        .status(400)
        .json({ status: 400, message: 'type,  period are required!' })
    }

    const { startDate, endDate } = rangeDate(period)

    let areaQuery = {}
    if (area) {
      if (area.length == 2) {
        areaQuery.zone = area.slice(0, 2)
      } else if (area.length == 5) {
        areaQuery['store.area'] = area
      }
    }
    let query = {
      type,
      ...areaQuery,
      // 'store.area': area,
      // createdAt: { $gte: startDate, $lt: endDate }
      period: period
    }

    if (store) {
      query['store.storeId'] = store
    }

    const order = await Giveaway.aggregate([
      {
        $addFields: {
          zone: { $substrBytes: ['$store.area', 0, 2] }
        }
      },

      { $match: query }
    ])
    // console.log(order)
    if (!order || order.length === 0) {
      return res.status(404).json({
        status: 404,
        message: 'No orders found!',
        data: []
      })
    }

    response = order
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) // เรียงจากใหม่ไปเก่า
      .map(o => ({
        orderId: o.orderId,
        area: o.store.area,
        giveName: o.giveInfo?.name || '',
        storeId: o.store?.storeId || '',
        storeName: o.store?.name || '',
        storeAddress: o.store?.address || '',
        createAt: o.createdAt,
        total: o.total,
        listProduct:o.listProduct.length,
        status: o.status
      }))
    // console.log(response)
    // const io = getSocket()
    // io.emit('give/all', {});

    res.status(200).json({
      status: 200,
      message: 'Successful!',
      data: response
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getDetail = async (req, res) => {
  try {
    const { orderId } = req.params
    if (!orderId) {
      return res
        .status(400)
        .json({ status: 400, message: 'orderId is required!' })
    }

    const channel = req.headers['x-channel']
    const { Giveaway } = getModelsByChannel(channel, res, giveawaysModel)

    const order = await Giveaway.findOne({ orderId })

    // const io = getSocket()
    // io.emit('give/detail', {});

    res.status(200).json({
      status: 200,
      message: 'successful!',
      data: [order]
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getGiveaways = async (req, res) => {
  const channel = req.headers['x-channel']
  const { Givetype } = getModelsByChannel(channel, res, giveawaysModel)
  let data = await Givetype.find().sort({ createdAt: -1 })

  // const io = getSocket()
  // io.emit('give/getGiveaways', {});

  res.status(200).json({
    status: 200,
    message: 'successful!',
    data: data
  })
}

exports.getGiveawaysDetail = async (req, res) => {
  const channel = req.headers['x-channel']
  const { Givetype } = getModelsByChannel(channel, res, giveawaysModel)
  let data = await Givetype.findOne({ giveId: req.params.giveId })

  // const io = getSocket()
  // io.emit('give/getGiveawaysDetail', {});

  res.status(200).json({
    status: 200,
    message: 'successful!',
    data: data
  })
}

exports.addimageGive = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { Giveaway } = getModelsByChannel(channel, res, giveawaysModel)

    upload(req, res, async err => {
      if (err) {
        return res.status(400).json({
          status: 400,
          message: 'Error uploading file',
          error: err.message
        })
      }

      const { orderId, type } = req.body
      if (!orderId || !type) {
        return res
          .status(400)
          .json({ status: 400, message: 'orderId and type required!' })
      }

      const order = await Giveaway.findOne({ orderId })
      if (!order) {
        return res
          .status(404)
          .json({ status: 404, message: 'Giveaway not found!' })
      }

      if (!req.file) {
        return res
          .status(400)
          .json({ status: 400, message: 'No images uploaded!' })
      }

      const basePath = path.join(__dirname, '../../public/images')
      const uploadedImage = await uploadFiles(
        [req.file],
        basePath,
        type,
        order.orderId
      )

      order.listImage = [
        {
          name: uploadedImage[0].name,
          path: uploadedImage[0].path,
          type: type
        }
      ]

      await order.save()

      const io = getSocket()
      io.emit('give/addimageGive', {
        status: 200,
        message: 'Images uploaded successfully!',
        data: order.listImage
      })

      res.status(200).json({
        status: 200,
        message: 'Images uploaded successfully!',
        data: order.listImage
      })
    })
  } catch (error) {
    console.error('Error uploading images:', error)
    res
      .status(500)
      .json({ status: 500, message: 'Server error', error: error.message })
  }
}

exports.approveGive = async (req, res) => {
  try {
    const { orderId, status } = req.body
    const statusStr = status === true ? 'approved' : 'rejected'
    const statusThStr = status === true ? 'อนุมัติ' : 'ไม่อนุมัติ'
    const channel = req.headers['x-channel']
    const { Giveaway } = getModelsByChannel(channel, res, giveawaysModel)

    // const giveawayData = await Giveaway.findOneAndUpdate(
    //   { orderId: orderId, type: 'give' },
    //   { $set: { statusTH: statusThStr, status: statusStr } },
    //   { new: true }
    // );

    const giveawayData = await Giveaway.findOne({
      orderId: orderId,
      type: 'give'
    })

    if (!giveawayData) {
      return res.status(404).json({
        status: 404,
        message: `ไม่พบข้อมูลที่มี orderId: ${orderId}`
      })
    }

    const productQty = giveawayData.listProduct.map(u => ({
      id: u.id,
      unit: u.unit,
      qty: u.qty
    }))

    // 🟢 ถ้าอนุมัติ ให้ updateStock 'give'
    if (status === true) {
      for (const item of productQty) {
        const updateResult = await updateStockMongo(
          item,
          giveawayData.store.area,
          giveawayData.period,
          'give',
          channel,
          res
        )
        console.log(item)
        if (updateResult) return
      }
    }

    // 🔴 ถ้าไม่อนุมัติ ให้ updateStock 'deleteCart'
    else {
      for (const item of productQty) {
        const updateResult = await updateStockMongo(
          item,
          giveawayData.store.area,
          giveawayData.period,
          'orderCanceled',
          channel,
          res
        )
        if (updateResult) return
      }
    }

    res.status(200).json({
      status: 200,
      message: `อัปเดตสถานะเรียบร้อย (${statusThStr})`,
      data: giveawayData
    })
  } catch (error) {
    console.error('Error approving giveaway:', error)
    res.status(500).json({
      status: 500,
      message: 'Server error',
      error: error.message
    })
  }
}

exports.updateStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body
    const channel = req.headers['x-channel']
    const { Giveaway } = getModelsByChannel(channel, res, giveawaysModel)

    // ✅ Validate input
    if (!orderId || !status) {
      return res.status(400).json({
        status: 400,
        message: 'orderId and status are required.'
      })
    }

    // ✅ Set Thai status name
    const statusTH = status === 'canceled' ? 'ยกเลิก' : 'ไม่ระบุสถานะ'

    // ✅ Find giveaway data
    const giveawayData = await Giveaway.findOne({ orderId, type: 'give' })
    if (!giveawayData) {
      return res.status(404).json({
        status: 404,
        message: `No giveaway data found for orderId: ${orderId}`
      })
    }

    // ✅ Return product stock
    const productQty = (giveawayData.listProduct || []).map(u => ({
      id: u.id,
      unit: u.unit,
      qty: u.qty
    }))

    for (const item of productQty) {
      // console.log(item)
      const updateResult = await updateStockMongo(
        item,
        giveawayData.store.area,
        giveawayData.period,
        'orderCanceled',
        channel,
        res
      )
      if (updateResult) return // Stop if stock update fails
    }

    // ✅ Update order status
    const updatedOrder = await Giveaway.findOneAndUpdate(
      { orderId },
      { $set: { status, statusTH } },
      { new: true }
    )

    return res.status(200).json({
      status: 200,
      message: `Status updated successfully (${statusTH})`,
      data: updatedOrder
    })
  } catch (error) {
    console.error('Error updating giveaway status:', error)
    return res.status(500).json({
      status: 500,
      message: 'Server error occurred while updating status.',
      error: error.message
    })
  }
}

exports.giveToExcel = async (req, res) => {
  const { channel, date } = req.query

  // console.log(channel, date)
  let statusArray = (req.query.status || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  if (statusArray.length === 0) {
    statusArray = ['pending'] // default
  }
  // ,'approved','completed'
  if (!date || date === 'null') {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0') // เดือนเริ่มที่ 0
    const day = String(today.getDate()).padStart(2, '0')

    date = `${year}${month}${day}`
    // console.log('📅 date:', date)
  }

  const start = new Date(
    `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00`
  )
  const end = new Date(
    `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T23:59:59.999`
  )

  // const channel = 'cash';
  const { Giveaway } = getModelsByChannel(channel, res, giveawaysModel)

  // const modelOrder = await Order.find({
  //   orderId: { $not: /CC/ },
  // })

  // ช่วงเวลา "ไทย" ที่ผู้ใช้เลือก
  const startTH = new Date(
    `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00+07:00`
  )
  const endTH = new Date(
    `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(
      6,
      8
    )}T23:59:59.999+07:00`
  )

  // console.log(startTH, endTH)

  const giveOrder = await Giveaway.aggregate([
    {
      $match: {
        createdAt: {
          $gte: startTH,
          $lte: endTH
        }
      }
    },
    {
      $match: {
        status: { $nin: ['canceled', 'competed'] },
        status: { $in: statusArray },
        type: { $in: ['give'] },
        'store.area': { $ne: 'IT211' }
        // 'store.area': 'NE211'
      }
    },
    {
      $addFields: {
        createdAtThai: {
          $dateAdd: {
            startDate: '$createdAt',
            unit: 'hour',
            amount: 7
          }
        }
      }
    },
    {
      $sort: { orderId: 1 } // เรียงจากน้อยไปมาก (ASC) ถ้าอยากให้ใหม่สุดอยู่บน ใช้ -1
    }
  ])

  function formatDateToThaiYYYYMMDD (date) {
    const d = new Date(date)
    // d.setHours(d.getHours() + 7) // บวก 7 ชั่วโมงให้เป็นเวลาไทย (UTC+7)

    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')

    return `${yyyy}${mm}${dd}`
  }

  const dataTran = giveOrder.map(item => {
    const TRDT = formatDateToThaiYYYYMMDD(item.createdAt)
    const TRTM = new Date(item.createdAt).getTime()

    const listProduct = item.listProduct.map(o => {
      return {
        CONO: '',
        WHLO: item.sale.warehouse,
        TWLO: item.sale.warehouse,
        ADID: item.store.area,
        WHSL: '',
        RIDN: '',
        TRTP: item.giveInfo.type,
        RORC: '0',
        RORN: item.orderId.slice(1),
        DEPT: item.giveInfo.dept,
        TRDT: `${TRDT}`,
        TRTM: `${TRTM}`,
        RIDT: '',
        RITM: '',
        REMK: item.giveInfo.remark,
        RPDT: '',
        RPTM: '',
        RESP: 'MVXSECOFR',
        ITNO: `${o.id}`,
        TRQT: `${o.qtyPcs}`,
        TWSL: '',
        BANO: '',
        RSCD: '',
        TRPR: '0',
        BREF: '',
        BRE2: '',
        REFE: '',
        ROUT: ''
      }
    })
    return [...listProduct]
  })

  const data = dataTran.flatMap(item => item)

  function yyyymmddToDdMmYyyy (dateString) {
    // สมมติ dateString คือ '20250804'
    const year = dateString.slice(0, 4)
    const month = dateString.slice(4, 6)
    const day = dateString.slice(6, 8)
    return `${day}${month}${year}`
  }

  const wb = xlsx.utils.book_new()
  const ws = xlsx.utils.json_to_sheet(data)
  xlsx.utils.book_append_sheet(wb, ws, `ESP${yyyymmddToDdMmYyyy(date)}`)

  const tempPath = path.join(os.tmpdir(), `${yyyymmddToDdMmYyyy(date)}.xlsx`)
  // xlsx.writeFile(wb, tempPath)

  xlsx.writeFile(wb, tempPath, {
    bookType: 'xlsx', // Excel 2007+
    bookSST: true, // shared strings table (helps older 2007)
    compression: true // smaller file, widely supported
  })

  // proper MIME for xlsx (Excel 2007+)
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )

  res.download(tempPath, `CA_GIVE_${yyyymmddToDdMmYyyy(date)}.xlsx`, err => {
    if (err) {
      console.error('❌ Download error:', err)
      // อย่าพยายามส่ง response ซ้ำถ้า header ถูกส่งแล้ว
      if (!res.headersSent) {
        res.status(500).send('Download failed')
      }
    }

    // ✅ ลบไฟล์ทิ้งหลังจากส่งเสร็จ (หรือส่งไม่สำเร็จ)
    fs.unlink(tempPath, () => {})
  })

  // return res.status(200).json({
  //   status: 200,
  //   message: `Sucess`,
  //   data: data
  // })
}
