// const { Givetype, Giveaways } = require('../../models/cash/give')
// const { Cart } = require('../../models/cash/cart')
// const { User } = require('../../models/cash/user')
const {
  generateGiveawaysId,
  generateGivetypeId
} = require('../../utilities/genetateId')
const {
  getProductGive,
  getStoreGive,
  getProductGiveNew
} = require('./giveProduct')
const { summaryGive } = require('../../utilities/summary')
const { rangeDate } = require('../../utilities/datetime')
const { period, previousPeriod } = require('../../utilities/datetime')
const productModel = require('../../models/cash/product')
const { getSocket } = require('../../socket')
const stockModel = require('../../models/cash/stock')
const giveawaysModel = require('../../models/cash/give')
const cartModel = require('../../models/cash/cart')
const userModel = require('../../models/cash/user')
const storeModel = require('../../models/cash/store')
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
const { pipeline } = require('stream')

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

    const givetypes = await Givetype.find({})
      .select('-_id giveId type remark name')
      .lean()

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
    const { area, period, giveId } = req.body
    const channel = req.headers['x-channel']

    const { Stock, StockMovementLog, StockMovement } = getModelsByChannel(
      channel,
      res,
      stockModel
    )

    if (!giveId) {
      return res.status(400).json({
        status: 400,
        message: 'area and giveId are required!'
      })
    }

    const products = await getProductGiveNew(giveId, area, channel, res)
    const stock = await Stock.findOne({ period: period, area: area })

    let data = []

    for (item of products) {
      const factor = item.listUnit[0].factor
      const stockProduct = stock.listProduct.find(i => i.productId === item.id)

      if (
        !stockProduct ||
        !stockProduct.balancePcs ||
        stockProduct.balancePcs <= 0
      ) {
        continue
      }

      const dataTran = {
        ...item,
        qtyPcs: stockProduct.balancePcs,
        qty: Math.floor(stockProduct.balancePcs / factor),
        unit: item.listUnit[0].unit
      }

      data.push(dataTran)
    }

    if (!products.length) {
      return res.status(404).json({
        status: 404,
        message: 'No products found for the given giveId and area',
        data: []
      })
    }

    res.status(200).json({
      status: 200,
      message: 'Successfully fetched give product filters!',
      data: data
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
    const { Store, TypeStore } = getModelsByChannel(channel, res, storeModel)
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

    const cart = await Cart.findOne({ type, area, storeId, proId: giveId })
    if (!cart || cart.listProduct.length === 0) {
      return res.status(404).json({ status: 404, message: 'Cart is empty!' })
    }

    const sale = await User.findOne({ area }).select(
      'firstName surName warehouse tel saleCode salePayer area zone'
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

    let storeData = {}

    if (channel === 'pc') {
      storeData =
        (await Store.findOne({
          storeId: cart.storeId,
          area: cart.area,
        }).lean()) || {}
    }

    function isAug2025OrLater (createAt) {
      if (!createAt) return false

      // case: "YYYYMM" เช่น "202508"
      if (typeof createAt === 'string' && /^\d{6}$/.test(createAt)) {
        const y = Number(createAt.slice(0, 4))
        const m = Number(createAt.slice(4, 6))
        return y * 100 + m >= 2025 * 100 + 8
      }

      // case: Date / ISO / YYYY-MM-DD / YYYYMMDD
      const d = createAt instanceof Date ? createAt : new Date(createAt)
      // console.log(d)
      if (isNaN(d)) return false
      const ym = d.getFullYear() * 100 + (d.getMonth() + 1) // เดือนเริ่มที่ 0
      return ym >= 202508
    }

    // ✅ ต่อ address + subDistrict เฉพาะเมื่อถึงเกณฑ์
    const addressFinal = isAug2025OrLater(storeData.createdAt)
      ? [
          storeData.address,
          storeData.subDistrict && `ต.${storeData.subDistrict}`,
          storeData.district && `อ.${storeData.district}`,
          storeData.province && `จ.${storeData.province}`,
          storeData.postCode
        ]
          .filter(Boolean)
          .join(' ')
      : storeData.address

    const orderId = await generateGiveawaysId(
      area,
      sale.warehouse,
      give.type,
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
        storeId: storeData.storeId,
        name: storeData.name,
        type: storeData.type,
        address: addressFinal,
        taxId: storeData.taxId,
        tel: storeData.tel,
        area: sale.area,
        zone: sale.zone
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
    const { type, area, store, period, start, end, zone, giveName } = req.query
    let response = []

    const channel = req.headers['x-channel']
    const { Giveaway } = getModelsByChannel(channel, res, giveawaysModel)

    if (!type) {
      return res.status(400).json({ status: 400, message: 'type is required!' })
    }

    let startDate, endDate

    if (start && end) {
      // ตัด string แล้ว parse เป็น Date
      // startDate = new Date(
      //   start.substring(0, 4), // year: 2025
      //   parseInt(start.substring(4, 6), 10) - 1, // month: 08 → index 7
      //   start.substring(6, 8) // day: 01
      // )

      // endDate = new Date(
      //   end.substring(0, 4), // year: 2025
      //   parseInt(end.substring(4, 6), 10) - 1, // month: 08 → index 7
      //   end.substring(6, 8) // day: 01
      // )

      startDate = new Date(
        `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(
          6,
          8
        )}T00:00:00+07:00`
      )
      endDate = new Date(
        `${end.slice(0, 4)}-${end.slice(4, 6)}-${end.slice(
          6,
          8
        )}T23:59:59.999+07:00`
      )
    } else if (period) {
      const range = rangeDate(period) // ฟังก์ชันที่คุณมีอยู่แล้ว
      startDate = range.startDate
      endDate = range.endDate
    } else {
      return res
        .status(400)
        .json({ status: 400, message: 'period or start/end are required!' })
    }

    let areaQuery = {}
    // if (area) {
    //   if (area.length == 2) {
    //     areaQuery.zone = area.slice(0, 2)
    //   } else if (area.length == 5) {
    //     areaQuery['store.area'] = area
    //   }
    // }
    if (area) {
      areaQuery['store.area'] = area
    } else if (zone) {
      areaQuery['store.zone'] = zone
    }

    if (giveName) {
      areaQuery.giveInfo.name = giveName
    }

    // if (zone && !area) {
    //   areaQuery['store.area'] = { $regex: `^${zone}`, $options: 'i' }
    // } else if (area.length == 5) {
    //   areaQuery['store.area'] = area
    // }

    let query = {
      type,
      ...areaQuery,
      // 'store.area': area,
      // createdAt: { $gte: startDate, $lt: endDate }
      ...(period ? { period } : {}),
      createdAt: { $gte: startDate, $lte: endDate }
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
        giveInfo: o.giveInfo,
        sale: o.sale,
        storeId: o.store?.storeId || '',
        storeName: o.store?.name || '',
        storeAddress: o.store?.address || '',
        createAt: o.createdAt,
        total: o.total,
        listProduct: o.listProduct.length,
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
        // console.log(item)
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

const orderUpdateTimestamps = {}

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

    // ===== debounce ตรงนี้ =====
    const now = Date.now()
    const lastUpdate = orderUpdateTimestamps[orderId] || 0
    const ONE_MINUTE = 60 * 1000

    if (now - lastUpdate < ONE_MINUTE) {
      return res.status(429).json({
        status: 429,
        message:
          'This order was updated less than 1 minute ago. Please try again later!'
      })
    }
    orderUpdateTimestamps[orderId] = now
    // ===== end debounce =====

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
  const { channel, startDate, endDate, giveName, area, team, zone } = req.query

  // console.log(channel, date)
  let statusArray = (req.query.status || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  if (statusArray.length === 0) {
    statusArray = ['pending'] // default
  }
  // ,'approved','completed'
  // if (!date || date === 'null') {
  //   const today = new Date()
  //   const year = today.getFullYear()
  //   const month = String(today.getMonth() + 1).padStart(2, '0') // เดือนเริ่มที่ 0
  //   const day = String(today.getDate()).padStart(2, '0')

  //   date = `${year}${month}${day}`
  //   // console.log('📅 date:', date)
  // }

  // const start = new Date(
  //   `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00`
  // )
  // const end = new Date(
  //   `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T23:59:59.999`
  // )

  // const channel = 'cash';
  const { Giveaway } = getModelsByChannel(channel, res, giveawaysModel)

  // const modelOrder = await Order.find({
  //   orderId: { $not: /CC/ },
  // })

  // ช่วงเวลา "ไทย" ที่ผู้ใช้เลือก
  const startTH = new Date(
    `${startDate.slice(0, 4)}-${startDate.slice(4, 6)}-${startDate.slice(
      6,
      8
    )}T00:00:00+07:00`
  )
  const endTH = new Date(
    `${endDate.slice(0, 4)}-${endDate.slice(4, 6)}-${endDate.slice(
      6,
      8
    )}T23:59:59.999+07:00`
  )
  // let query = {}

  let query = {
    status: { $nin: ['canceled', 'competed'] },
    status: { $in: statusArray },
    type: { $in: ['give'] },
    'store.area': { $ne: 'IT211' },
    createdAt: {
      $gte: startTH,
      $lte: endTH
    }
  }

  if (area) {
    query['store.area'] = area
  } else if (zone) {
    query['store.area'] = { $regex: `^${zone}`, $options: 'i' }
  }

  if (giveName) {
    query['giveInfo.name'] = giveName
  }

  console.log(query)

  const pipeline = [
    {
      $match: query
    },
    {
      $addFields: {
        createdAtThai: {
          $dateAdd: {
            startDate: '$createdAt',
            unit: 'hour',
            amount: 7
          }
        },
        team3: {
          $concat: [
            { $substrCP: ['$store.area', 0, 2] },
            { $substrCP: ['$store.area', 3, 1] }
          ]
        }
      }
    }
  ]

  if (team) {
    pipeline.push({
      $match: {
        team3: { $regex: `^${team}`, $options: 'i' }
      }
    })
  }

  // pipeline.push({
  //   $sort: { statusASC: 1, createdAt: -1 }
  // })

  const giveOrder = await Giveaway.aggregate(pipeline)

  function formatDateToThaiYYYYMMDD (date) {
    const d = new Date(date)
    // d.setHours(d.getHours() + 7) // บวก 7 ชั่วโมงให้เป็นเวลาไทย (UTC+7)

    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')

    return `${yyyy}${mm}${dd}`
  }

  function getCurrentTimeFormatted () {
    const now = new Date()
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    return `${hours}${minutes}${seconds}`
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
        RORN: `${item.orderId}`,
        DEPT: `${item.giveInfo.dept}`,
        TRDT: `${TRDT}`,
        TRTM: `${getCurrentTimeFormatted()}`,
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
  xlsx.utils.book_append_sheet(wb, ws, `ESP${yyyymmddToDdMmYyyy(startDate)}`)

  const tempPath = path.join(
    os.tmpdir(),
    `${yyyymmddToDdMmYyyy(startDate)}.xlsx`
  )
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

  res.download(
    tempPath,
    `CA_GIVE_${yyyymmddToDdMmYyyy(startDate)}.xlsx`,
    err => {
      if (err) {
        console.error('❌ Download error:', err)
        // อย่าพยายามส่ง response ซ้ำถ้า header ถูกส่งแล้ว
        if (!res.headersSent) {
          res.status(500).send('Download failed')
        }
      }

      // ✅ ลบไฟล์ทิ้งหลังจากส่งเสร็จ (หรือส่งไม่สำเร็จ)
      fs.unlink(tempPath, () => {})
    }
  )

  // return res.status(200).json({
  //   status: 200,
  //   message: `Sucess`,
  //   data: data
  // })
}

exports.fixOrderIdsGive = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { Giveaway } = getModelsByChannel(channel, res, giveawaysModel)

    // 1) ดึงเฉพาะออเดอร์รูปแบบเก่า แล้ว sort ตาม createdAt : 1 (เก่าสุดก่อน)
    const giveOrders = await Giveaway.find(
      { orderId: /^6809\d{3}/ }, // ของเดิม 6809 + 3 หลัก
      { _id: 1, orderId: 1, giveInfo: 1, createdAt: 1 }
    )
      .sort({ createdAt: 1, _id: 1 }) // สำคัญ: ให้เลขแรกมาจาก createdAt เก่าสุด
      .lean()

    // 2) preload orderId ที่อยู่ในรูปแบบใหม่แล้ว (6809 + 2 หลัก + 4 หลักรัน)
    const existingNew = await Giveaway.find(
      { orderId: /^6809\d{2}\d{4}$/ }, // 6809XX####
      { orderId: 1, _id: 0 }
    ).lean()

    // set สำหรับกันชนซ้ำ และ map เก็บ next seq ต่อ prefix
    const used = new Set(existingNew.map(d => d.orderId))
    const nextSeqByPrefix = new Map()

    // คำนวณ next seq เริ่มต้นจากข้อมูลที่มีอยู่แล้วใน DB
    for (const { orderId } of existingNew) {
      const prefix = orderId.slice(0, 6) // 6809 + 2 หลัก type
      const seq = parseInt(orderId.slice(6), 10) // ####
      const curr = nextSeqByPrefix.get(prefix) ?? 1
      nextSeqByPrefix.set(prefix, Math.max(curr, seq + 1))
    }

    // cache กันชนซ้ำในรอบนี้ (ลดโอกาส duplicate)
    const seenThisRun = new Set()

    const ops = []

    for (const doc of giveOrders) {
      // ดึง typePart = giveInfo.type.slice(1,3) → 2 หลัก
      const typePart = doc.giveInfo?.type?.slice(1, 3) || '00'
      const prefix = `6809${typePart}` // ตัวอย่าง: 680916

      // หา seq เริ่มต้นต่อ prefix
      let seq = nextSeqByPrefix.get(prefix) ?? 1
      let newId = `${prefix}${String(seq).padStart(4, '0')}`

      // กันชนซ้ำทั้งใน DB ที่ preload มา และในรอบนี้
      while (used.has(newId) || seenThisRun.has(newId)) {
        seq++
        newId = `${prefix}${String(seq).padStart(4, '0')}`
      }

      // ถ้า orderId เดิมเหมือนใหม่ → skip
      if (doc.orderId === newId) continue

      // mark ใช้แล้ว & อัป next seq
      used.add(newId)
      seenThisRun.add(newId)
      nextSeqByPrefix.set(prefix, seq + 1)

      // ใช้ bulkWrite ให้เร็วและกัน race เล็กน้อยด้วยการแมทช์ orderId เดิม
      ops.push({
        updateOne: {
          filter: { _id: doc._id, orderId: doc.orderId },
          update: { $set: { orderId: newId } }
        }
      })
    }

    if (ops.length) {
      await Giveaway.bulkWrite(ops, { ordered: true })
    }

    return res.json({
      message: 'fixOrderIdsGive completed',
      total: giveOrders.length,
      updated: ops.length
    })
  } catch (error) {
    console.error('fixOrderIdsGive error', error)
    return res.status(500).json({ message: 'Internal Server Error' })
  }
}

// exports.fixOrderIdsGive = async (req, res) => {
//   try {
//     const channel = req.headers['x-channel']
//     const { Giveaway } = getModelsByChannel(channel, res, giveawaysModel)
//     const giveOrders = await Giveaway.find({ orderId: /^6809\d{3}/ })
//     // cache กันชนซ้ำในรอบนี้ (ลดโอกาส duplicate)
//     const seen = new Set()

//     for (const doc of giveOrders) {
//       // ดึง typePart = giveInfo.type.slice(1,3)
//       const typePart = doc.giveInfo?.type?.slice(1, 3) || '00'
//       const prefix = `6809${typePart}`

//       // เริ่ม seq ที่ 1
//       let seq = 1
//       let newId = `${prefix}${String(seq).padStart(4, '0')}`

//       // วนเช็คซ้ำ: ใน DB และใน memory
//       // (index orderId จะช่วยให้เร็วขึ้น)
//       // เพิ่ม check ทั้งใน DB และใน set
//       while (seen.has(newId) || (await Giveaway.exists({ orderId: newId }))) {
//         seq++
//         newId = `${prefix}${String(seq).padStart(4, '0')}`
//       }

//       // ถ้า orderId เดิมเหมือนกับใหม่ → skip
//       if (doc.orderId === newId) {
//         continue
//       }

//       // บันทึกค่าใหม่
//       doc.orderId = newId
//       await doc.save()

//       // mark ว่ามีใช้แล้ว
//       seen.add(newId)
//     }

//     return res.json({
//       message: 'fixOrderIdsGive completed',
//       count: giveOrders.length
//     })
//   } catch (error) {
//     console.error('fixOrderIdsGive error', error)
//     return res.status(500).json({ message: 'Internal Server Error' })
//   }
// }
