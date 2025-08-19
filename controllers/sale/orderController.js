// const { Order } = require('../../models/cash/sale')
// const { Cart } = require('../../models/cash/cart')
// const { User } = require('../../models/cash/user')
// const { Product } = require('../../models/cash/product')
// const { Route } = require('../../models/cash/route')
const { period, previousPeriod } = require('../../utilities/datetime')
const axios = require('axios')
const dayjs = require('dayjs')
const { getSeries, updateRunningNumber } = require('../../middleware/order')
const { Item } = require('../../models/item/itemlot')
const { Sale, ItemLotM3 } = require('../../models/cash/master')
const { Op, fn, col, where, literal } = require('sequelize')
const { generateOrderId } = require('../../utilities/genetateId')
const {
  summaryOrder,
  summaryOrderProStatusOne
} = require('../../utilities/summary')
// const { fn, col } = require('sequelize')
const { sequelize, DataTypes } = require('../../config/m3db')
const { rangeDate } = require('../../utilities/datetime')
const { uploadFiles } = require('../../utilities/upload')
const { checkInRoute } = require('../route/checkIn')
const multer = require('multer')
const upload = multer({ storage: multer.memoryStorage() }).single('image')
const _ = require('lodash')
const {
  to2,
  updateStockMongo,
  generateDateList
} = require('../../middleware/order')
const { DateTime } = require('luxon')
const { getSocket } = require('../../socket')
const {
  applyPromotion,
  applyPromotionUsage
} = require('../promotion/calculate')
const stockModel = require('../../models/cash/stock')
const disributionModel = require('../../models/cash/distribution')
const sendmoneyModel = require('../../models/cash/sendmoney')
const orderModel = require('../../models/cash/sale')
const cartModel = require('../../models/cash/cart')
const userModel = require('../../models/cash/user')
const productModel = require('../../models/cash/product')
const routeModel = require('../../models/cash/route')
const promotionModel = require('../../models/cash/promotion')
const distributionModel = require('../../models/cash/distribution')
const refundModel = require('../../models/cash/refund')
const storeModel = require('../../models/cash/store')
const { getModelsByChannel } = require('../../middleware/channel')
const { formatDateTimeToThai } = require('../../middleware/order')

const xlsx = require('xlsx')
const path = require('path')
const os = require('os')
const fs = require('fs')

const orderTimestamps = {}

exports.checkout = async (req, res) => {
  // const transaction = await sequelize.transaction();
  try {
    const {
      type,
      area,
      storeId,
      routeId,
      period,
      note,
      latitude,
      longitude,
      shipping,
      payment,
      changePromotionStatus,
      listPromotion = []
    } = req.body

    const channel = req.headers['x-channel']

    const { Cart } = getModelsByChannel(channel, res, cartModel)
    const { User } = getModelsByChannel(channel, res, userModel)
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Store, TypeStore } = getModelsByChannel(channel, res, storeModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Promotion, PromotionShelf, Quota } = getModelsByChannel(
      channel,
      res,
      promotionModel
    )
    const { Stock, StockMovementLog, StockMovement } = getModelsByChannel(
      channel,
      res,
      stockModel
    )

    if (!type || !area || !storeId || !payment) {
      return res
        .status(400)
        .json({ status: 400, message: 'Missing required fields!' })
    }

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

    let summary = ''
    if (changePromotionStatus == 0) {
      summary = await summaryOrder(cart, channel, res)
    } else if (changePromotionStatus == 1) {
      summary = await summaryOrderProStatusOne(
        cart,
        listPromotion,
        channel,
        res
      )
      // res.json(summary); // return ตรงนี้เลย
    }
    // console.log(summary)
    const productIds = cart.listProduct.map(p => p.id)
    const products = await Product.find({ id: { $in: productIds } }).select(
      'id name groupCode group brandCode brand size flavourCode flavour listUnit'
    )

    let subtotal = 0
    let listProduct = cart.listProduct.map(item => {
      const product = products.find(p => p.id === item.id)
      if (!product) return null

      const unitData = product.listUnit.find(u => u.unit === item.unit)
      if (!unitData) {
        return res.status(400).json({
          status: 400,
          message: `Invalid unit for product ${item.id}`
        })
      }

      const totalPrice = item.qty * unitData.price.sale
      subtotal += totalPrice

      return {
        id: product.id,
        // lot: item.lot,
        name: product.name,
        group: product.group,
        groupCode: product.groupCode,
        brandCode: product.brandCode,
        brand: product.brand,
        size: product.size,
        flavourCode: product.flavourCode,
        flavour: product.flavour,
        qty: item.qty,
        unit: item.unit,
        unitName: unitData.name,
        price: unitData.price.sale,
        subtotal: parseFloat(totalPrice.toFixed(2)),
        discount: 0,
        netTotal: parseFloat(totalPrice.toFixed(2))
      }
    })
    if (listProduct.includes(null)) return

    const orderId = await generateOrderId(area, sale.warehouse, channel, res)
    // console.log(orderId)
    // if () {

    // }

    const promotionshelf =
      (await PromotionShelf.find({
        storeId: storeId,
        period: period,
        qty: 1
      })) || {}
    const discountProduct = promotionshelf?.length
      ? promotionshelf
          .map(item => item.price)
          .reduce((sum, price) => sum + price, 0)
      : 0
    const total = subtotal - discountProduct
    const newOrder = new Order({
      orderId,
      routeId,
      type,
      status: 'pending',
      statusTH: 'รอนำเข้า',
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
        zone: summary.store.zone,
        isBeauty: summary.store.isBeauty
      },
      // shipping,
      // address,
      note,
      latitude,
      longitude,
      listProduct,
      listPromotions: summary.listPromotion,
      listQuota: summary.listQuota,
      subtotal,
      discount: 0,
      discountProductId: promotionshelf.map(item => ({
        proShelfId: item.proShelfId
      })),
      discountProduct: discountProduct,
      vat: parseFloat((total - total / 1.07).toFixed(2)),
      totalExVat: parseFloat((total / 1.07).toFixed(2)),
      total: total,
      shipping: shipping,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      createdBy: sale.username,
      period: period
    })
    applyPromotionUsage(
      newOrder.store.storeId,
      newOrder.listPromotions,
      channel,
      res
    )

    const checkIn = await checkInRoute(
      {
        storeId: storeId,
        routeId: routeId,
        orderId: orderId,
        note: note,
        latitude: latitude,
        longitude: longitude,
        period: period
      },
      channel,
      res
    )

    // if (checkIn.status === 409) {
    //   return res.status(409).json({
    //     status: 409,
    //     message: 'Duplicate Store on this day'
    //   })
    // }

    const promotion = await applyPromotion(summary, channel, res)

    // ลบโปรโมชั่นซ้ำโดยเช็คจาก proId
    // const seenProIds = new Set();
    // cart.listPromotion = promotion.appliedPromotions.filter(promo => {
    //   // ❌ ตัดโปรที่จำนวนเป็น 0 ออก
    //   if (promo.proQty === 0) return false;

    //   // ❌ ตัดโปรที่ซ้ำ proId
    //   if (seenProIds.has(promo.proId)) return false;

    //   seenProIds.add(promo.proId);
    //   return true;
    // });
    // console.log(promotion)

    const uniquePromotions = []
    const seen = new Set()

    for (const item of newOrder.listPromotions) {
      if (!seen.has(item.proId)) {
        seen.add(item.proId)
        uniquePromotions.push(item)
      }
    }

    newOrder.listPromotions = uniquePromotions

    newOrder.listPromotions.forEach(item => {
      const promo = promotion.appliedPromotions.find(
        u => u.proId === item.proId
      )

      if (!promo) return

      if (promo.proQty - item.proQty < 0) {
        item.proQty = promo.proQty
      }
    })

    // console.log("newOrder.listPromotions", newOrder.listPromotions)

    for (const item of newOrder.listQuota) {
      await Quota.findOneAndUpdate(
        { quotaId: item.quotaId },
        {
          $inc: {
            quota: -item.quota,
            quotaUse: +item.quota
          }
        }
      )
    }

    const qtyproduct = newOrder.listProduct
      .filter(u => u?.id && u?.unit && u?.qty > 0)
      .map(u => ({
        id: u.id,
        unit: u.unit,
        qty: u.qty,
        statusMovement: 'OUT'
      }))
    const qtyproductPro = newOrder.listPromotions.flatMap(u => {
      const promoDetail = u.listProduct
        .filter(item => item?.id && item?.unit && item?.qty > 0)
        .map(item => ({
          id: item.id,
          unit: item.unit,
          qty: item.qty,
          statusMovement: 'OUT'
        }))
      return promoDetail
    })

    const productQty = Object.values(
      [...qtyproductPro, ...qtyproduct].reduce((acc, cur) => {
        // [, ...qtyproduct].reduce((acc, cur) => {

        const key = `${cur.productId}-${cur.unit}`
        acc[key] = acc[key]
          ? { ...cur, qty: acc[key].qty + cur.qty }
          : { ...cur }
        return acc
      }, {})
    )
    // ตัด stock เบล ver
    for (const item of qtyproduct) {
      const updateResult = await updateStockMongo(
        item,
        area,
        period,
        'sale',
        channel,
        res
      )
      if (updateResult) return
    }

    for (const item of qtyproductPro) {
      const updateResult = await updateStockMongo(
        item,
        area,
        period,
        'promotion',
        channel,
        res
      )
      if (updateResult) return
    }

    const calStock = {
      // storeId: refundOrder.store.storeId,
      orderId: newOrder.orderId,
      area: newOrder.store.area,
      saleCode: sale.saleCode,
      period: period,
      warehouse: newOrder.sale.warehouse,
      status: 'pending',
      statusTH: 'รอนำเข้า',
      action: 'Sale',
      type: 'Sale',
      product: [...productQty]
    }

    const createdMovement = await StockMovement.create({
      ...calStock
    })

    await StockMovementLog.create({
      ...calStock,
      refOrderId: createdMovement._id
    })
    await newOrder.save()
    await PromotionShelf.findOneAndUpdate(
      { proShelfId: promotionshelf.proShelfId },
      { $set: { qty: 0 } }
    )
    await Cart.deleteOne({ type, area, storeId })
    const currentDate = new Date()
    let query = {}
    const promoIds = newOrder.listPromotions.map(u => u.proId)
    const promoDetail = await Promotion.find({ proId: { $in: promoIds } })
    const startMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    )

    const NextMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      1
    )

    query.createdAt = {
      $gte: startMonth,
      $lt: NextMonth
    }

    for (const item of promoDetail) {
      if (item.applicableTo.isNewStore === true) {
        await Promotion.findOneAndUpdate(
          { proId: item.proId },
          {
            $addToSet: {
              'applicableTo.completeStoreNew': newOrder.store.storeId
            }
          }
        )
      } else if (item.applicableTo.isbeauty === true) {
        await Promotion.findOneAndUpdate(
          { proId: item.proId },
          {
            $addToSet: {
              'applicableTo.completeStoreBeauty': newOrder.store.storeId
            }
          }
        )
      }
    }

    const io = getSocket()
    io.emit('order/checkout', {
      status: 200,
      message: 'Checkout successful!',
      data: newOrder
    })

    // await transaction.commit()
    res.status(200).json({
      status: 200,
      message: 'Checkout successful!',
      data: newOrder
    })
  } catch (error) {
    // await transaction.rollback()
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.reflashOrder = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { Order } = getModelsByChannel(channel, null, orderModel)
    // 1. Get sale order numbers (OAORNO) ที่มีใน Sale
    const modelSale = await Sale.findAll({
      attributes: [
        'OACUOR',
        [sequelize.fn('COUNT', sequelize.col('OACUOR')), 'count']
      ],
      group: ['OACUOR']
    })
    const saleIds = modelSale.map(row => row.get('OACUOR').toString())

    // 2. Get pending orderIds ใน MongoDB
    const inMongo = await Order.find({ status: 'pending' }).select('orderId')
    const orderIdsInMongo = inMongo.map(item => item.orderId.toString())

    // 3. filter ให้เหลือเฉพาะที่อยู่ทั้งสองฝั่ง
    const matchedIds = orderIdsInMongo.filter(id => saleIds.includes(id))

    // 4. อัปเดตทุกตัวที่ match (วนทีละตัว)
    let updatedCount = 0
    for (const orderId of matchedIds) {
      try {
        const result = await Order.updateOne(
          { orderId },
          {
            $set: {
              status: 'completed',
              statusTH: 'สำเร็จ',
              updatedAt: new Date()
            }
          }
        )
        if (result.modifiedCount > 0) updatedCount++
      } catch (err) {
        console.error(`Error update orderId: ${orderId}`, err)
      }
    }
    res.status(200).json({
      status: 200,
      message: 'Successful!',
      data: updatedCount
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getOrder = async (req, res) => {
  try {
    const { type, area, store, period, start, end } = req.query

    const channel = req.headers['x-channel']

    const { Order } = getModelsByChannel(channel, res, orderModel)

    let response = []

    if (!type || !period) {
      return res
        .status(400)
        .json({ status: 400, message: 'type,  period are required!' })
    }

    // ✅ คำนวณช่วงวัน
    let startDate, endDate
    if (start && end) {
      startDate = new Date(start)
      endDate = new Date(end)
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
      period: period,
      createdAt: { $gte: startDate, $lte: endDate } // ✅ filter ช่วงวัน
    }

    if (store) {
      query['store.storeId'] = store
    }

    const order = await Order.aggregate([
      {
        $addFields: {
          zone: { $substrBytes: ['$store.area', 0, 2] }
        }
      },
      { $match: query }
    ])

    // console.log(order)

    // const order = await Order.find(query)
    //   .select(
    //     'orderId store.createdAt store.storeId store.name store.address total status statusTH createdAt'
    //   )
    //   .lean()
    // console.log("order",order)
    if (!order || order.length === 0) {
      return res.status(404).json({
        status: 404,
        message: 'No orders found!',
        data: []
      })
    }

    response = order
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) // เรียงใหม่ไปเก่า
      .map(o => ({
        orderId: o.orderId,
        area: o.store.area,
        storeId: o.store?.store || '',
        storeName: o.store?.name || '',
        storeAddress: o.store?.address || '',
        createAt: o.createdAt,
        total: to2(o.total),
        status: o.status,
        statusTH: o.statusTH,
        createdAt: o.createdAt,
        listProduct: o.listProduct.length,
        listPromotion: o.listPromotions.length
      }))

    // const io = getSocket()
    // io.emit('order/all', {});

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
    const channel = req.headers['x-channel']

    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)

    if (!orderId) {
      return res
        .status(400)
        .json({ status: 400, message: 'orderId is required!' })
    }

    // หาจาก Order ก่อน
    let doc = await Order.findOne({ orderId })
    let source = 'order'

    // ถ้าไม่เจอ ค่อยหาใน Refund
    if (!doc) {
      doc = await Refund.findOne({ orderId })
      source = 'refund'
    }

    if (!doc) {
      return res.status(404).json({
        status: 404,
        message: `Not found ${orderId} in Order or Refund`
      })
    }

    const toThai = d =>
      d instanceof Date ? new Date(d.getTime() + 7 * 60 * 60 * 1000) : d

    const data = {
      ...doc.toObject(),
      createdAt: toThai(doc.createdAt),
      updatedAt: toThai(doc.updatedAt),
      _source: source // บอกว่าได้มาจากไหน (order/refund)
    }

    return res.status(200).json({
      status: 200,
      message: 'successful!',
      data: [data]
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ status: 500, message: error.message })
  }
}

const orderUpdateTimestamps = {}

exports.updateStatus = async (req, res) => {
  // const session = await require('mongoose').startSession();
  // session.startTransaction();
  try {
    const { orderId, status } = req.body

    const channel = req.headers['x-channel']
    const { Promotion } = getModelsByChannel(channel, res, promotionModel)
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Stock } = getModelsByChannel(channel, res, stockModel)

    if (!orderId || !status) {
      // await session.abortTransaction();
      // session.endSession();
      return res
        .status(400)
        .json({ status: 400, message: 'orderId, status are required!' })
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

    const order = await Order.findOne({ orderId })
    // .session(session);
    if (!order) {
      // await session.abortTransaction();
      // session.endSession();
      return res.status(404).json({ status: 404, message: 'Order not found!' })
    }

    if (order.status !== 'pending' && status !== 'canceled') {
      // await session.abortTransaction();
      // session.endSession();
      return res.status(400).json({
        status: 400,
        message: 'Cannot update status, order is not in pending state!'
      })
    }

    let newOrderId = orderId

    if (status === 'canceled' && !orderId.endsWith('CC')) {
      statusTH = 'ยกเลิก'
      const isDuplicate = await Order.findOne({ orderId: newOrderId })
      if (isDuplicate) {
        let counter = 1
        while (await Order.findOne({ orderId: `${orderId}CC${counter}` })) {
          counter++
        }
        newOrderId = `${orderId}CC${counter}`
      }
    }

    if (order.listProduct.length > 0) {
      for (const product of order.listProduct) {
        // await updateStockMongo(u, order.store.area, order.period, 'orderCanceled', channel)
        const updateResult = await updateStockMongo(
          product,
          order.store.area,
          order.period,
          'orderCanceled',
          channel,
          res
        )
        if (updateResult) return
      }
    }

    if (order.listPromotions.length > 0) {
      for (const item of order.listPromotions) {
        const promotionDetail =
          (await Promotion.findOne({ proId: item.proId })) ||
          new Promotion({ proId: item.proId })
        const storeIdToRemove = order.store.storeId
        if (promotionDetail.applicableTo?.isNewStore === true) {
          promotionDetail.applicableTo.completeStoreNew =
            promotionDetail.applicableTo.completeStoreNew?.filter(
              storeId => storeId !== storeIdToRemove
            ) || []
        } else if (promotionDetail.applicableTo?.isbeauty === true) {
          promotionDetail.applicableTo.completeStoreBeauty =
            promotionDetail.applicableTo.completeStoreBeauty?.filter(
              storeId => storeId !== storeIdToRemove
            ) || []
        }
        await promotionDetail.save().catch(() => {}) // ถ้าเป็น doc ใหม่ต้อง .save()
        for (const u of item.listProduct) {
          // await updateStockMongo(u, order.store.area, order.period, 'orderCanceled', channel)
          const updateResult = await updateStockMongo(
            u,
            order.store.area,
            order.period,
            'orderCanceled',
            channel,
            res
          )
          if (updateResult) return
        }
      }
    }

    const updatedOrder = await Order.findOneAndUpdate(
      { orderId },
      { $set: { status, statusTH, orderId: newOrderId } },
      { new: true }
    )

    // await session.commitTransaction();
    // session.endSession();

    const io = getSocket()
    io.emit('order/updateStatus', {
      status: 200,
      message: 'Updated status successfully!',
      data: updatedOrder
    })

    res.status(200).json({
      status: 200,
      message: 'Updated status successfully!',
      data: updatedOrder
    })
  } catch (error) {
    // await session.abortTransaction();
    // session.endSession();
    console.error('Error updating order:', error)
    res.status(500).json({ status: 500, message: 'Server error' })
  }
}

exports.addSlip = async (req, res) => {
  try {
    const channel = req.headers['x-channel']

    const { Order } = getModelsByChannel(channel, res, orderModel)

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
      const order = await Order.findOne({ orderId })
      if (!order) {
        return res
          .status(404)
          .json({ status: 404, message: 'Order not found!' })
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
      io.emit('order/addSlip', {
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

exports.OrderToExcel = async (req, res) => {
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
  console.log(statusArray)
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
  const { Order } = getModelsByChannel(channel, res, orderModel)
  const { Refund } = getModelsByChannel(channel, res, refundModel)

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

  const modelOrder = await Order.aggregate([
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
        status: { $nin: ['canceled'] },
        status: { $in: statusArray },
        type: { $in: ['sale'] },
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
      $project: {
        // ดึงเฉพาะที่ต้องใช้
        createdAt: 1,
        orderId: 1,
        sale: 1,
        store: 1,
        listProduct: 1,
        listPromotions: 1
      }
    }
  ])

  const modelChange = await Order.aggregate([
    {
      $match: {
        status: { $nin: ['canceled'] },
        'store.area': { $ne: 'IT211' },
        // 'store.area': 'NE211',
        status: { $in: statusArray },
        type: { $in: ['change'] }
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
      $match: {
        createdAt: {
          $gte: startTH,
          $lte: endTH
        }
      }
    }
  ])

  const modelRefund = await Refund.aggregate([
    {
      $match: {
        status: { $nin: ['canceled'] },
        status: { $in: statusArray },
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
      $match: {
        createdAt: {
          $gte: startTH,
          $lte: endTH
        }
      }
    }
  ])

  const tranFromOrder = modelOrder.flatMap(order => {
    let counterOrder = 0
    function formatDateToThaiYYYYMMDD (date) {
      const d = new Date(date)
      // d.setHours(d.getHours() + 7) // บวก 7 ชั่วโมงให้เป็นเวลาไทย (UTC+7)

      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')

      return `${yyyy}${mm}${dd}`
    }
    // console.log(order.createdAtThai)
    // ใช้งาน
    const RLDT = formatDateToThaiYYYYMMDD(order.createdAt)

    const listProduct = order.listProduct.map(product => {
      return {
        proCode: '',
        id: product.id,
        name: product.name,
        group: product.group,
        brand: product.brand,
        size: product.size,
        flavour: product.flavour,
        qty: product.qty,
        unit: product.unit,
        unitName: product.unitName,
        price: product.price,
        subtotal: product.subtotal,
        discount: product.discount,
        netTotal: product.netTotal
      }
    })

    const listPromotion = order.listPromotions.map(promo =>
      promo.listProduct.map(product => {
        return {
          proCode: promo.proCode,
          id: product.id,
          name: product.name,
          group: product.group,
          brand: product.brand,
          size: product.size,
          flavour: product.flavour,
          qty: product.qty,
          unit: product.unit,
          unitName: product.unitName,
          qtyPcs: product.qtyPcs
        }
      })
    )

    const productIDS = [...listProduct, ...listPromotion].flat()

    // console.log("productIDS",productIDS)
    return productIDS.map(product => {
      counterOrder++

      // const promoCount = 0; // สามารถเปลี่ยนเป็นตัวเลขอื่นเพื่อทดสอบ

      return {
        CUNO: order.store.storeId,
        FACI: 'F10',
        WHLO: order.sale.warehouse,
        ORNO: '',
        OAORTP: 'A31',
        RLDT: RLDT,
        ADID: '',
        CUOR: order.orderId,
        OAOREF: '',
        OBITNO: product.id,
        OBBANO: '',
        OBALUN: product.unit,
        OBORQA: `${product.qty}`,
        OBSAPR: `${product.price || 0}`,
        OBSPUN: product.unit,
        OBWHSL: '',
        ROUT: '',
        OBPONR: `${counterOrder}`,
        OBDIA2: `${product.discount || 0}`,
        OBRSCD: '',
        OBCMNO: '',
        OBPIDE: product.proCode,
        OBSMCD: order.sale.saleCode,
        OAORDT: RLDT,
        OAODAM: '0',
        OECRID: '',
        OECRAM: '',
        OECRID2: '',
        OECRAM2: '',
        OECRID3: '',
        OECRAM3: '',
        OECRID4: '',
        OECRAM4: '',
        OECRID5: '',
        OECRAM5: '',
        OARESP: '',
        OAYREF: '',
        OATEL2: '',
        OAWCON: '',
        OAFRE1: '',
        OATXAP: '',
        OATXAP2: '',
        OBDIA1: '',
        OBDIA3: '',
        OBDIA4: ''
      }
    })
  })

  const tranFromChange = modelChange.flatMap(order => {
    let counterOrder = 0
    function formatDateToThaiYYYYMMDD (date) {
      const d = new Date(date)
      d.setHours(d.getHours() + 7) // บวก 7 ชั่วโมงให้เป็นเวลาไทย (UTC+7)

      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')

      return `${yyyy}${mm}${dd}`
    }

    // ใช้งาน
    const RLDT = formatDateToThaiYYYYMMDD(order.createdAt)

    const listProduct = order.listProduct.map(product => {
      return {
        proCode: '',
        id: product.id,
        name: product.name,
        group: product.group,
        brand: product.brand,
        size: product.size,
        flavour: product.flavour,
        qty: product.qty,
        unit: product.unit,
        unitName: product.unitName,
        price: product.price,
        subtotal: product.subtotal,
        discount: product.discount,
        netTotal: product.netTotal
      }
    })

    const productIDS = [...listProduct].flat()

    // console.log("productIDS",productIDS)
    return productIDS.map(product => {
      counterOrder++

      // const promoCount = 0; // สามารถเปลี่ยนเป็นตัวเลขอื่นเพื่อทดสอบ

      return {
        CUNO: order.store.storeId,
        FACI: 'F10',
        WHLO: order.sale.warehouse,
        ORNO: '',
        OAORTP: 'B31',
        RLDT: RLDT,
        ADID: '',
        CUOR: order.orderId,
        OAOREF: '',
        OBITNO: product.id,
        OBBANO: '',
        OBALUN: product.unit,
        OBORQA: `${product.qty}`,
        OBSAPR: `${product.price || 0}`,
        OBSPUN: product.unit,
        OBWHSL: '',
        ROUT: '',
        OBPONR: `${counterOrder}`,
        OBDIA2: `${product.discount || 0}`,
        OBRSCD: '',
        OBCMNO: '',
        OBPIDE: product.proCode,
        OBSMCD: order.sale.saleCode,
        OAORDT: RLDT,
        OAODAM: '0',
        OECRID: '',
        OECRAM: '',
        OECRID2: '',
        OECRAM2: '',
        OECRID3: '',
        OECRAM3: '',
        OECRID4: '',
        OECRAM4: '',
        OECRID5: '',
        OECRAM5: '',
        OARESP: '',
        OAYREF: '',
        OATEL2: '',
        OAWCON: '',
        OAFRE1: '',
        OATXAP: '',
        OATXAP2: '',
        OBDIA1: '',
        OBDIA3: '',
        OBDIA4: ''
      }
    })
  })

  // const currentYear = new Date().getFullYear()
  // const years = [
  //   // currentYear +1
  //   currentYear, // ปีปัจจุบัน
  //   currentYear - 1, // ปีก่อน
  //   currentYear - 2, // ย้อนหลัง 2 ปี
  //   currentYear + 1 // ย้อนหลัง 2 ปี
  // ]

  // รวบรวม itemCode ทั้งหมดจาก refund
  const refundItems = modelRefund.flatMap(o => o.listProduct.map(p => p.id))
  console.log(refundItems)
  const uniqueCodes = [...new Set(refundItems)]

  // ปีที่ยอมรับ
  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear - 1, currentYear - 2, currentYear + 1]

  // ดึงล็อตรวดเดียวจาก MSSQL (Sequelize)
  const lotRows = await ItemLotM3.findAll({
    where: {
      itemCode: { [Op.in]: uniqueCodes },
      expireDate: { [Op.or]: years.map(y => ({ [Op.like]: `${y}%` })) },
      [Op.and]: [literal('LEN(LTRIM(RTRIM([LMBANO]))) = 16')]
    },
    attributes: ['itemCode', 'lot'], // แค่นี้พอ
    raw: true
  })

  // ทำ map เพื่อ lookup เร็ว O(1)
  const lotMap = new Map()
  for (const r of lotRows) {
    const code = (r.itemCode || '').trim() // <<<<<< สำคัญ
    const lot = (r.lot || '').trim()
    const curr = lotMap.get(code)

    // ถ้ายังไม่มี หรือ lot นี้ใหม่กว่า ให้ทับ
    if (!curr || lot > curr) {
      // ตัวเลขความยาวเท่ากัน เปรียบเทียบ string ได้
      lotMap.set(code, lot)
    }
  }

  // console.log('uniqueCodes', uniqueCodes)
  // console.log('lotRows', lotRows)
  // console.log('lotMap', lotMap)

  // --- สร้าง tranFromRefund ให้แบน ---
  const tranFromRefundNested = await Promise.all(
    modelRefund.map(async order => {
      let counterOrder = 0

      const formatDateToThaiYYYYMMDD = date => {
        const d = new Date(date)
        d.setHours(d.getHours() + 7)
        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        return `${yyyy}${mm}${dd}`
      }

      const RLDT = formatDateToThaiYYYYMMDD(order.createdAt)

      const listProduct = await Promise.all(
        order.listProduct
          // .filter(p => p.condition === 'good')
          .map(async p => {
            // const lotData = await Item.findAll({
            //   where: {
            //     itemCode: p.id,
            //     expireDate: { [Op.like]: `23%` },
            //     [Op.and]: [{ lot: { [Op.regexp]: '^[0-9]{16}$' } }]
            //   }
            // })
            // const lotData = await Item.findOne({
            //   where: {
            //     itemCode: p.id,
            //     expireDate: {
            //       [Op.or]: years.map(y => ({ [Op.like]: `${y}%` }))
            //     },
            //     // date: {
            //     //   [Op.like]: `${p.expireDate.slice(0, 4)}%`
            //     // },
            //     // lot: { [Op.like]: `${p.expireDate.slice(2, 4)}%` },
            //     [Op.and]: [
            //       literal('LEN(LTRIM(RTRIM([Lot]))) = 16') // ความยาว 16 ตัวอักษร
            //       // literal("LTRIM(RTRIM([Lot])) NOT LIKE '%[^0-9]%'") // ไม่มีตัวที่ไม่ใช่ตัวเลข
            //     ]
            //   }
            // })
            return {
              proCode: '',
              id: p.id,
              name: p.name,
              group: p.group,
              brand: p.brand,
              size: p.size,
              flavour: p.flavour,
              qty: p.qty,
              unit: p.unit,
              unitName: p.unitName,
              price: p.price,
              subtotal: p.subtotal,
              discount: p.discount,
              netTotal: p.netTotal,
              lotNo: lotMap.get(p.id) || ''
              // lotNo: lotData?.lot || null
            }
          })
      )

      return listProduct.map(product => {
        counterOrder++
        return {
          CUNO: order.store.storeId,
          FACI: 'F10',
          WHLO: order.sale.warehouse,
          ORNO: '',
          OAORTP: 'A34', // << คืนของ
          RLDT: RLDT,
          ADID: '',
          CUOR: order.orderId,
          OAOREF: '',
          OBITNO: product.id,
          OBBANO: product.lotNo ?? '', // อย่าใช้ ${} ในอ็อบเจ็กต์
          OBALUN: product.unit,
          OBORQA: `-${product.qty}`,
          OBSAPR: `${product.price}`,
          OBSPUN: product.unit,
          OBWHSL: 'CS0001',
          ROUT: '',
          OBPONR: `${counterOrder}`,
          OBDIA2: `${product.discount || 0}`,
          OBRSCD: '',
          OBCMNO: '',
          OBPIDE: '',
          OBSMCD: order.sale.saleCode,
          OAORDT: RLDT,
          OAODAM: '0',
          OECRID: '',
          OECRAM: '',
          OECRID2: '',
          OECRAM2: '',
          OECRID3: '',
          OECRAM3: '',
          OECRID4: '',
          OECRAM4: '',
          OECRID5: '',
          OECRAM5: '',
          OARESP: '',
          OAYREF: '',
          OATEL2: '',
          OAWCON: '',
          OAFRE1: '',
          OATXAP: '',
          OATXAP2: '',
          OBDIA1: '',
          OBDIA3: '',
          OBDIA4: ''
        }
      })
    })
  )

  const tranFromRefund = tranFromRefundNested.flat()

  if (tranFromOrder.length == 0) {
    return res.status(404).json({
      status: 404,
      message: 'Not Found Order'
    })
  }
  function yyyymmddToDdMmYyyy (dateString) {
    // สมมติ dateString คือ '20250804'
    const year = dateString.slice(0, 4)
    const month = dateString.slice(4, 6)
    const day = dateString.slice(6, 8)
    return `${day}${month}${year}`
  }

  // รวม Order + Refund ให้เป็นชุดข้อมูลเดียว
  const allTransactions = [
    ...tranFromOrder,
    ...tranFromChange,
    ...tranFromRefund
  ]

  const wb = xlsx.utils.book_new()
  const ws = xlsx.utils.json_to_sheet(allTransactions)
  xlsx.utils.book_append_sheet(wb, ws, `ESP${yyyymmddToDdMmYyyy(date)}`)

  const tempPath = path.join(os.tmpdir(), `${yyyymmddToDdMmYyyy(date)}.xlsx`)
  xlsx.writeFile(wb, tempPath)

  res.download(tempPath, `CA_${yyyymmddToDdMmYyyy(date)}.xlsx`, err => {
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

  // res.status(200).json({
  //   status:200,
  //   OBSAPR:sum(OBSAPR)
  // })
}

exports.getAllOrder = async (req, res) => {
  try {
    const { period } = req.query

    const channel = req.headers['x-channel']

    const { Order } = getModelsByChannel(channel, res, orderModel)

    if (period) {
      const periodYear = period.slice(0, 4)
      const month = period.slice(4, 6)

      // สร้างช่วงเวลาของเดือนนั้นใน timezone Bangkok
      // const start = new Date(
      //   new Date(`${periodYear}-${month}-01T00:00:00`).toLocaleString('en-US', {
      //     timeZone: 'Asia/Bangkok'
      //   })
      // )

      // const end = new Date(new Date(start).setMonth(start.getMonth() + 1))

      const modelOrder = await Order.aggregate([
        {
          $match: {
            period: period,
            type: { $in: ['sale', 'change'] }
          }
        },
        {
          $group: {
            _id: '$store.area', // Group by area
            summary: { $sum: '$total' } // รวม total
          }
        },
        {
          $project: {
            area: '$_id',
            summary: 1,
            // count: 1,
            _id: 0
          }
        }
      ])

      if (modelOrder.length == 0) {
        return res.status(404).json({
          status: 404,
          message: 'Not Found Order'
        })
      }

      const data = modelOrder.map(item => ({
        area: item.area,
        summary: item.summary
      }))

      res.status(200).json({
        status: 200,
        message: 'success',
        data: data
      })
    } else {
      const year = parseInt(req.query.year)

      const modelOrder = await Order.aggregate([
        {
          $match: {
            $expr: {
              $eq: [{ $year: '$createdAt' }, year] // ดึงปีจาก createdAt แล้วเปรียบเทียบกับ year
            },
            type: { $in: ['sale', 'change'] }
          }
        },
        {
          $group: {
            _id: '$store.area', // Group by area
            summary: { $sum: '$total' } // รวม total
          }
        },
        {
          $project: {
            area: '$_id',
            summary: 1,
            _id: 0
          }
        }
      ])

      const data = modelOrder.map(item => ({
        area: item.area,
        summary: item.summary
      }))

      // const io = getSocket()
      // io.emit('order/getAllOrder', {});

      res.status(200).json({
        status: 200,
        message: 'success',
        data: data
      })
    }
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getSummaryItem = async (req, res) => {
  try {
    // const { area, period, group, flavour, brand } = req.query

    const { area, period, group, brand, flavour, size, type } = req.body

    const channel = req.headers['x-channel']

    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)

    const periodYear = period.slice(0, 4)
    const month = period.slice(4, 6)

    const start = new Date(
      new Date(`${periodYear}-${month}-01T00:00:00`).toLocaleString('en-US', {
        timeZone: 'Asia/Bangkok'
      })
    )

    const end = new Date(new Date(start).setMonth(start.getMonth() + 1))

    const modelOrder = await Order.aggregate([
      {
        $match: {
          'store.area': area,
          period: period,
          type: { $in: ['sale', 'change'] }
        }
      },
      { $unwind: { path: '$listProduct', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          listProduct: 1,
          _id: 0
        }
      }
    ])
    if (!modelOrder || modelOrder.length === 0) {
      return res.status(404).json({
        status: 404,
        message: 'Not Found Order'
      })
    }
    // console.log("modelOrder",modelOrder)

    const productIds = modelOrder.map(order => order.listProduct.id)
    // .listProduct.map(product => product.id)
    // console.log("productIds",productIds)

    const parseArrayParam = param => {
      if (!param) return []
      try {
        return typeof param === 'string' ? JSON.parse(param) : param
      } catch (error) {
        return param.split(',')
      }
    }

    let filter = {}
    const groupArray = parseArrayParam(group)
    const brandArray = parseArrayParam(brand)
    const flavourArray = parseArrayParam(flavour)
    const sizeArray = parseArrayParam(size)

    let conditions = []
    if (productIds.length) conditions.push({ id: { $in: productIds } })
    if (groupArray.length) conditions.push({ groupCode: { $in: groupArray } })
    if (brandArray.length) conditions.push({ brandCode: { $in: brandArray } })
    if (flavourArray.length)
      conditions.push({ flavourCode: { $in: flavourArray } })
    if (sizeArray.length) conditions.push({ size: { $in: sizeArray } })

    if (conditions.length) filter.$and = conditions

    const products = await Product.aggregate([{ $match: filter }])

    if (products.length == 0) {
      return res.status(404).json({
        status: 404,
        message: 'Not Found Product'
      })
    }

    const data = products.map(product => {
      const netTotal = modelOrder.find(
        order => order.listProduct.id === product.id
      )
      return {
        id: product.id,
        groupCode: product.groupCode,
        brandCode: product.brandCode,
        flavourCode: product.flavourCode,
        size: product.size,
        netTotal: netTotal.listProduct.netTotal
      }
    })

    if (!type) {
      return res.status(404).json({
        status: 404,
        message: 'type is require'
      })
    }

    let result = []

    if (type == 'group') {
      const groupedByGroupCode = data.reduce((acc, item) => {
        if (!acc[item.groupCode]) {
          acc[item.groupCode] = {
            groupCode: item.groupCode,
            totalNetTotal: 0
          }
        }

        acc[item.groupCode].totalNetTotal += item.netTotal

        return acc
      }, {})

      result = Object.values(groupedByGroupCode)
      // console.log(result)
    } else if (type == 'flavour') {
      const groupedByFlavourCode = data.reduce((acc, item) => {
        if (!acc[item.flavourCode]) {
          acc[item.flavourCode] = {
            flavourCode: item.flavourCode,
            totalNetTotal: 0
          }
        }

        acc[item.flavourCode].totalNetTotal += item.netTotal

        return acc
      }, {})

      result = Object.values(groupedByFlavourCode)
      // console.log(result)
    } else if (type == 'size') {
      const groupedBySize = data.reduce((acc, item) => {
        if (!acc[item.size]) {
          acc[item.size] = {
            size: item.size,
            totalNetTotal: 0
          }
        }

        acc[item.size].totalNetTotal += item.netTotal

        return acc
      }, {})

      result = Object.values(groupedBySize)
      // console.log(result)
    } else if (type == 'brand') {
      const groupedByBrandCode = data.reduce((acc, item) => {
        if (!acc[item.brandCode]) {
          acc[item.brandCode] = {
            brandCode: item.brandCode,
            totalNetTotal: 0
          }
        }

        acc[item.brandCode].totalNetTotal += item.netTotal

        return acc
      }, {})

      result = Object.values(groupedByBrandCode)
      // console.log(result)
    }

    // const io = getSocket()
    // io.emit('order/getSummaryItem', {});

    res.status(200).json({
      status: 200,
      message: 'success',
      data: result
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getSummarybyRoute = async (req, res) => {
  try {
    const { area, period } = req.query

    const channel = req.headers['x-channel']

    const { Route } = getModelsByChannel(channel, res, routeModel)

    const modelRoute = await Route.aggregate([
      { $match: { area, period } },
      { $unwind: { path: '$listStore', preserveNullAndEmptyArrays: true } },
      {
        $unwind: {
          path: '$listStore.listOrder',
          preserveNullAndEmptyArrays: true
        }
      },

      // JOIN: นำ orderId จาก listOrder ไป join กับ collection Order
      {
        $lookup: {
          from: 'orders', // ชื่อ collection ที่จะ join
          localField: 'listStore.listOrder.orderId',
          foreignField: 'orderId',
          as: 'orderDetails'
        }
      },

      // group by day, และ sum total จาก orderDetails
      {
        $group: {
          _id: '$day',
          totalAmount: {
            $sum: {
              $sum: {
                // เพิ่มการ sum ในนี้ถ้า `orderDetails` มีหลายรายการ
                $map: {
                  input: '$orderDetails', // เข้าไปใน array `orderDetails`
                  as: 'order', // ชื่อ alias ให้กับแต่ละ element ใน array
                  in: '$$order.total' // นำค่า `total` มารวมกัน
                }
              }
            }
          },
          orders: {
            $push: {
              total: { $arrayElemAt: ['$orderDetails.total', 0] } // ใช้ arrayElemAt สำหรับเลือก `total` ถ้ามีแค่ 1
            }
          }
        }
      },

      { $sort: { _id: 1 } },

      {
        $project: {
          day: '$_id',
          // orders: 1,
          totalAmount: 1,
          _id: 0
        }
      }
    ])

    if (modelRoute.length === 0) {
      return res.status(404).json({
        status: 404,
        message: 'Not Found Route'
      })
    }

    data = modelRoute.map(item => {
      return {
        route: item.day,
        summary: item.totalAmount
      }
    })

    // const io = getSocket()
    // io.emit('order/getSummarybyRoute', {});

    res.status(200).json({
      status: 200,
      message: 'success',
      data: data
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getSummarybyMonth = async (req, res) => {
  try {
    const { area, year, storeId, day } = req.query
    const channel = req.headers['x-channel'] // 'credit' or 'cash'

    // const { Store } = getModelsByChannel(channel,res,storeModel);
    // const { Route } = getModelsByChannel(channel,res,routeModel);
    const { Order } = getModelsByChannel(channel, res, orderModel)

    let pipeline = []

    pipeline.push(
      {
        $match: {
          'store.area': area,
          status: 'pending'
        }
      },
      { $unwind: { path: '$listStore', preserveNullAndEmptyArrays: true } },
      // { $match: matchStore },
      {
        $unwind: {
          path: '$listStore.listOrder',
          preserveNullAndEmptyArrays: true
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
        $addFields: {
          createdDay: { $dayOfMonth: '$createdAtThai' }
        }
      },
      {
        $addFields: {
          createdYear: { $year: '$createdAtThai' }
        }
      }
    )

    if (storeId) {
      pipeline.push({
        $match: {
          'store.storeId': storeId
        }
      })
    }
    if (year) {
      pipeline.push({
        $match: {
          createdYear: parseInt(year)
        }
      })
    }

    pipeline.push(
      {
        $project: {
          month: { $month: '$createdAtThai' },
          total: '$total'
        }
      },
      {
        $group: {
          _id: '$month',
          totalAmount: { $sum: '$total' }
        }
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          month: '$_id',
          totalAmount: 1,
          _id: 0
        }
      }
    )

    const modelOrder = await Order.aggregate(pipeline)
    const modelOrderValue = modelOrder.map(item => {
      return {
        month: item.month,
        summary: item.totalAmount
      }
    })

    const result = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      summary: 0
    }))

    // อัปเดตผลลัพธ์จาก data ที่มีอยู่
    modelOrderValue.forEach(d => {
      result[d.month - 1].summary = d.summary
    })

    // const io = getSocket()
    // io.emit('order/getSummarybyMonth', {});

    res.status(200).json({
      status: 200,
      message: 'Success',
      data: result
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Internal server error.' })
  }
}

exports.getSummarybyArea = async (req, res) => {
  try {
    const { period, year, type, zone, area } = req.query
    let query = {}

    if (area) {
      query = {
        $match: {
          area: area
        }
      }
    } else {
      query = {
        $match: {
          area: { $ne: null }
        }
      }
    }

    const channel = req.headers['x-channel'] // 'credit' or 'cash'

    const { Route } = getModelsByChannel(channel, res, routeModel)

    if (!period) {
      return res.status(404).json({
        status: 404,
        message: 'period is require'
      })
    }

    // if (type == 'route') {

    let groupStage = {}
    if (zone && type == 'route') {
      groupStage = {
        $group: {
          _id: { area: '$area', route: '$day' },
          totalAmount: { $sum: '$orderDetails.total' }
        }
      }
    } else if (area && type == 'route') {
      groupStage = {
        $group: {
          _id: { area: '$area', route: '$day' },
          totalAmount: { $sum: '$orderDetails.total' }
        }
      }
    } else if (type == 'route') {
      groupStage = {
        $group: {
          _id: { area: '$area2', route: '$day' },
          totalAmount: { $sum: '$orderDetails.total' }
        }
      }
    } else if (zone && type == 'year') {
      groupStage = {
        $group: {
          _id: { area: '$area', route: '$month' },
          totalAmount: { $sum: '$orderDetails.total' }
        }
      }
    } else if (area && type == 'year') {
      groupStage = {
        $group: {
          _id: { area: '$area', route: '$month' },
          totalAmount: { $sum: '$orderDetails.total' }
        }
      }
    } else if (type == 'year') {
      groupStage = {
        $group: {
          _id: { area: '$area2', route: '$month' },
          totalAmount: { $sum: '$orderDetails.total' }
        }
      }
    }

    const modelRouteValue = await Route.aggregate([
      { $match: { period } },
      { $project: { area: 1, day: 1, listStore: 1 } },
      { $unwind: { path: '$listStore', preserveNullAndEmptyArrays: true } },
      {
        $unwind: {
          path: '$listStore.listOrder',
          preserveNullAndEmptyArrays: true
        }
      },

      {
        $addFields: {
          convertedDate: {
            $dateToString: {
              format: '%Y-%m-%dT%H:%M:%S',
              date: '$listStore.listOrder.date',
              timezone: 'Asia/Bangkok'
            }
          },
          month: { $month: '$listStore.listOrder.date' },
          area2: { $substrCP: ['$area', 0, 2] }
        }
      },
      {
        $match: {
          $expr: {
            $cond: {
              if: { $eq: [year, null] },
              then: true,
              else: {
                $eq: [
                  { $substr: ['$convertedDate', 0, 4] },
                  { $toString: year }
                ]
              }
            }
          }
        }
      },
      query,
      {
        $lookup: {
          from: 'orders',
          localField: 'listStore.listOrder.orderId',
          foreignField: 'orderId',
          as: 'orderDetails'
        }
      },
      { $unwind: { path: '$orderDetails', preserveNullAndEmptyArrays: true } },
      groupStage
    ])

    // console.log("modelRouteValue", modelRouteValue)

    const haveArea = [...new Set(modelRouteValue.map(i => i.area))]
    otherModelRoute = await Route.aggregate([
      {
        $match: {
          period: period,
          area: { $nin: haveArea }
        }
      },
      { $project: { area: 1, day: 1, listStore: 1 } },
      { $unwind: { path: '$listStore', preserveNullAndEmptyArrays: true } },
      {
        $unwind: {
          path: '$listStore.listOrder',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $addFields: {
          month: { $month: '$listStore.listOrder.date' },
          area2: { $substrCP: ['$area', 0, 2] }
        }
      },
      {
        $lookup: {
          from: 'orders',
          localField: 'listStore.listOrder.orderId',
          foreignField: 'orderId',
          as: 'orderDetails'
        }
      },
      { $unwind: { path: '$orderDetails', preserveNullAndEmptyArrays: true } },
      query,
      groupStage,
      {
        $project: {
          area: '$_id.area',
          route: '$_id.route',
          totalAmount: 1,
          _id: 0
        }
      },
      { $sort: { area: 1, route: 1 } }
    ])

    if (modelRouteValue.length === 0) {
      return res.status(404).json({
        status: 404,
        message: 'Not Found Route This period'
      })
    }

    modelRoute = [...modelRouteValue, ...otherModelRoute]

    // const areaList = [...new Set(modelRoute.map(item => item.area))].filter(area => area !== undefined).sort();

    const areaList = [
      ...new Set(
        modelRoute
          .map(item => item.area)
          .filter(
            areaItem => areaItem && (zone ? areaItem.startsWith(zone) : true)
          )
      )
    ].sort()

    let data = []

    if (type === 'route' || type === 'year') {
      const totalMonths = type === 'route' ? 27 : 12

      data = areaList.map(area => {
        const filtered = modelRoute.filter(item => item.area === area)

        const filledMonths = Array.from({ length: totalMonths }, (_, i) => {
          const month = String(i + 1).padStart(2, '0')
          const found = filtered.find(
            item => String(item.route).padStart(2, '0') === month
          )

          return (
            found || {
              totalAmount: 0,
              area,
              month
            }
          )
        })

        return {
          area,
          summary: filledMonths.map(item => item.totalAmount)
        }
      })
    }

    // const io = getSocket()
    // io.emit('order/getSummarybyArea', {});

    res.status(200).json({
      status: 200,
      message: 'Success',
      data: data
    })
    // }
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Internal server error.' })
  }
}

exports.getSummarybyGroup = async (req, res) => {
  try {
    const { zone, group, period } = req.body

    const channel = req.headers['x-channel'] // 'credit' or 'cash'

    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Product } = getModelsByChannel(channel, res, productModel)

    const year = parseInt(period.slice(0, 4))
    const month = period.slice(4, 6)

    const start = DateTime.fromObject(
      { year, month, day: 1 },
      { zone: 'Asia/Bangkok' }
    )
      .toUTC()
      .toJSDate()
    const end = DateTime.fromObject(
      { year, month, day: 1 },
      { zone: 'Asia/Bangkok' }
    )
      .plus({ months: 1 })
      .toUTC()
      .toJSDate()

    const modelOrder = await Order.aggregate([
      {
        $match: {
          'store.zone': zone, // กรองตาม zone
          period: period
        }
      },
      { $unwind: { path: '$listProduct', preserveNullAndEmptyArrays: false } },
      { $match: { 'listProduct.groupCode': group } }
    ])

    const order = modelOrder.map(u => {
      return {
        id: u.listProduct.id,
        groupCode: u.listProduct.groupCode,
        size: u.listProduct.size,
        flavourCode: u.listProduct.flavourCode,
        qty: u.listProduct.qty
      }
    })

    const modelProduct = await Product.aggregate([
      { $match: { groupCode: group } },
      {
        $group: {
          _id: '$size',
          entries: {
            $push: {
              k: '$flavourCode',
              v: 0
            }
          },
          total: { $sum: '$value' }
        }
      },

      {
        $addFields: {
          entriesObject: { $arrayToObject: '$entries' }
        }
      },

      {
        $addFields: {
          fullObject: {
            $mergeObjects: [
              '$entriesObject',
              {
                $arrayToObject: [
                  [
                    {
                      k: { $concat: ['รวม', '$_id'] }, // ต่อข้อความ "รวม" + ขนาด
                      v: '$total'
                    }
                  ]
                ]
              }
            ]
          }
        }
      },
      {
        $replaceRoot: {
          newRoot: {
            $arrayToObject: [[{ k: '$_id', v: '$fullObject' }]]
          }
        }
      }
    ])

    if (!modelProduct || modelProduct.length === 0) {
      return res.status(404).json({
        status: 404,
        message: `Not found order for group ${group} and period ${period} `
      })
    }

    for (const item of order) {
      const { size, flavourCode, qty } = item

      const model = modelProduct.find(obj => obj[size])
      if (!model) continue

      if (model[size][flavourCode] !== undefined) {
        model[size][flavourCode] += qty

        const sumKey = `รวม${size}`
        if (model[size][sumKey] !== undefined) {
          model[size][sumKey] += qty
        }
      }
    }

    // const io = getSocket()
    // io.emit('order/getSummarybyGroup', {});

    res.status(200).json({
      status: 200,
      message: 'Success',
      data: modelProduct
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Internal server error.' })
  }
}

// exports.erpApiCheckOrder = async (req, res) => {
//   try {
//     const channel = 'cash';
//     const { Order } = getModelsByChannel(channel, res, orderModel);

//     // 1. ดึง OAORNO ทั้งหมดจาก Sale
//     const modelSale = await Sale.findAll({
//       attributes: [
//         'OAORNO',
//         [sequelize.fn('COUNT', sequelize.col('OAORNO')), 'count']
//       ],
//       group: ['OAORNO']
//     });

//     const saleId = modelSale.map(row => row.get('OAORNO'));

//     // 2. หาว่ามี order ไหนไม่อยู่ใน sale (optional ใช้ต่อได้ถ้าต้อง log/เก็บ)
//     const notInModelOrder = await Order.find({
//       orderId: { $nin: saleId }
//     }).select('orderId');

//     // 3. อัปเดตสถานะ success ให้ order ที่อยู่ใน saleId
//     const updateResult = await Order.updateMany(
//       { orderId: { $in: saleId } },
//       { $set: { status: 'success' } }
//     );

//     if (updateResult.modifiedCount === 0) {
//       console.log('No new order found in the M3 system');
//       return res.status(200).json({
//         message: 'No new order found in the M3 system'
//       });
//     }

//     // console.log('✅ Updated orderIds:', saleId);

//     // // 4. Broadcast ไปยังทุก event ที่ต้องการ
//     // const io = getSocket();
//     // const events = [
//     //   'sale_getSummarybyArea',
//     //   'sale_getSummarybyMonth',
//     //   'sale_getSummarybyRoute',
//     //   'sale_getSummaryItem',
//     //   'sale_getSummarybyGroup',
//     //   'sale_getRouteCheckinAll',
//     //   'sale_getTimelineCheckin',
//     //   'sale_routeTimeline'
//     // ];

//     // events.forEach(event => {
//     //   io.emit(event, {
//     //     status: 200,
//     //     message: 'New Update Data',
//     //     updatedCount: updateResult.modifiedCount
//     //   });
//     // });

//     // 5. ตอบกลับสำเร็จ
//     res.status(200).json({
//       status: 200,
//       message: 'Update status success',
//       updatedCount: updateResult.modifiedCount
//     });

//   } catch (error) {
//     console.error(error);
//     // res.status(500).json({ message: 'Internal server error.' });
//   }
// };

// exports.erpApiCheckDisributionM3 = async (req, res) => {
//   try {
//     const channel = 'cash';
//     const { Order } = getModelsByChannel(channel, res, orderModel);
//     const { Disribution } = getModelsByChannel(channel, res, disributionModel);

//     // 1. ดึง orderId จาก DisributionM3
//     const modelSale = await DisributionM3.findAll({
//       attributes: [
//         'MGTRNR',
//         [sequelize.fn('COUNT', sequelize.col('MGTRNR')), 'count']
//       ],
//       group: ['MGTRNR']
//     });

//     const orderIdList = modelSale.map(row => row.get('MGTRNR'));

//     // 2. อัปเดต status: 'success' สำหรับ orderId ที่เจอ
//     const updateResult = await Order.updateMany(
//       { orderId: { $in: orderIdList } },
//       { $set: { status: 'success' } }
//     );

//     // 3. ถ้าไม่มีอะไรอัปเดตเลย → return

//     if (updateResult.modifiedCount === 0) {
//       console.log('No new order Distribution found in the M3 system');
//       return res.status(200).json({
//         message: 'No new order Distribution found in the M3 system'
//       });
//     }

//     console.log('✅ Updated Distribution Order IDs:', orderIdList);

//     // 4. Broadcast ให้ client อัปเดต
//     // const io = getSocket();
//     // const events = [
//     //   'sale_getSummarybyArea',
//     //   'sale_getSummarybyMonth',
//     //   'sale_getSummarybyRoute',
//     //   'sale_getSummaryItem',
//     //   'sale_getSummarybyGroup',
//     //   'sale_getRouteCheckinAll',
//     //   'sale_getTimelineCheckin',
//     //   'sale_routeTimeline'
//     // ];

//     // events.forEach(event => {
//     //   io.emit(event, {
//     //     status: 200,
//     //     message: 'New Update Data',
//     //     updatedCount: updateResult.modifiedCount
//     //   });
//     // });

//     // 5. ตอบกลับ
//     res.status(200).json({
//       status: 200,
//       message: 'Update status success',
//       updatedCount: updateResult.modifiedCount
//     });
//   } catch (error) {
//     console.error('❌ Error in erpApiCheckDisributionM3:', error);
//     // res.status(500).json({ status: 500, message: 'Internal server error' });
//   }
// };

exports.getSummarybyChoice = async (req, res) => {
  try {
    const { storeId, area, date, type } = req.body
    const channel = req.headers['x-channel']

    if (!date || !type) {
      return res.status(400).json({
        status: 400,
        message: 'Date and type are required'
      })
    }

    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    let year, month, day
    if (type === 'day') {
      day = parseInt(date.substring(0, 2), 10)
      month = parseInt(date.substring(2, 4), 10)
      year = parseInt(date.substring(4, 8), 10)
    } else if (type === 'month') {
      month = date.substring(2, 4)
      year = parseInt(date.substring(4, 8), 10)
    } else if (type === 'year') {
      year = parseInt(date.substring(4, 8), 10)
    } else {
      return res.status(400).json({ status: 400, message: 'Invalid type' })
    }

    // แปลงเวลาไทย → UTC
    let start, end
    if (type === 'day') {
      start = new Date(Date.UTC(year, month - 1, day - 1, 17, 0, 0, 0)) // 00:00 TH
      end = new Date(Date.UTC(year, month - 1, day, 16, 59, 59, 999)) // 23:59:59 TH
    } else if (type === 'month') {
      start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)) // เริ่มต้นเดือน
      start.setUTCHours(start.getUTCHours() - 7) // หัก 7 ชม. (UTC = TH - 7)
      end = new Date(Date.UTC(year, month, 0, 16, 59, 59, 999)) // วันสุดท้ายของเดือน เวลา 23:59:59 TH
    } else if (type === 'year') {
      start = new Date(Date.UTC(year - 1, 11, 31, 17, 0, 0, 0)) // 1 ม.ค. เวลา 00:00 TH
      end = new Date(Date.UTC(year, 11, 31, 16, 59, 59, 999)) // 31 ธ.ค. เวลา 23:59:59 TH
    }

    // console.log(start, end)

    let matchStage = {
      'store.area': area,
      status: { $nin: ['canceled'] },
      createdAt: { $gte: start, $lte: end }
    }
    if (storeId) {
      matchStage['store.storeId'] = storeId
    }

    const modelOrder = await Order.aggregate([
      { $match: { type: 'sale' } }, // ✅ syntax ถูกต้อง
      { $match: matchStage },
      {
        $group: {
          _id: null,
          total: { $sum: '$total' }
        }
      },
      { $project: { _id: 0, total: 1 } }
    ])

    const modelChange = await Order.aggregate([
      { $match: { type: 'change' } }, // ✅ syntax ถูกต้อง
      { $match: matchStage },
      {
        $group: {
          _id: null,
          total: { $sum: '$total' }
        }
      },
      { $project: { _id: 0, total: 1 } }
    ])

    const modelRefund = await Refund.aggregate([
      { $match: { type: 'refund' } }, // ✅ syntax ถูกต้อง
      { $match: matchStage },
      {
        $group: {
          _id: null,
          total: { $sum: '$total' }
        }
      },
      { $project: { _id: 0, total: 1 } }
    ])

    if (modelOrder.length === 0) {
      return res.status(404).json({ status: 404, message: 'Not found order' })
    }

    const total =
      (modelOrder[0]?.total ?? 0) +
      ((modelChange[0]?.total ?? 0) - (modelRefund[0]?.total ?? 0))

    res.status(200).json({
      status: 200,
      message: 'Successful',
      total: total
    })
  } catch (err) {
    console.error('[getSummarybyChoice ERROR]', err)
    res.status(500).json({ status: 500, message: err.message })
  }
}

exports.getSaleSummaryByStore = async (req, res) => {
  const { routeId } = req.body
  const channel = req.headers['x-channel']
  const { Route } = getModelsByChannel(channel, res, routeModel)

  const routeData = await Route.aggregate([
    {
      $match: {
        id: routeId
      }
    },
    { $unwind: { path: '$listStore', preserveNullAndEmptyArrays: true } },
    {
      $unwind: {
        path: '$listStore.listOrder',
        preserveNullAndEmptyArrays: true
      }
    },

    {
      $addFields: {
        storeObjId: { $toObjectId: '$listStore.storeInfo' }
      }
    },
    {
      $lookup: {
        from: 'stores',
        localField: 'storeObjId',
        foreignField: '_id',
        as: 'storeDetail'
      }
    },

    {
      $lookup: {
        from: 'orders',
        localField: 'listStore.listOrder.orderId',
        foreignField: 'orderId',
        as: 'order'
      }
    },
    {
      $project: {
        storeId: { $arrayElemAt: ['$storeDetail.storeId', 0] },
        storeName: { $arrayElemAt: ['$storeDetail.name', 0] },
        orderId: {
          $ifNull: ['$listStore.listOrder.orderId', '']
        },
        status: '$listStore.statusText',
        sum: {
          $ifNull: [{ $arrayElemAt: ['$order.total', 0] }, 0]
        },
        phone: { $arrayElemAt: ['$storeDetail.tel', 0] },
        mapLink: {
          $concat: [
            'https://maps.google.com/?q=',
            { $toString: { $arrayElemAt: ['$storeDetail.latitude', 0] } },
            ',',
            { $toString: { $arrayElemAt: ['$storeDetail.longtitude', 0] } }
          ]
        },
        imageLink: '$listStore.image',
        datetime: {
          $cond: {
            if: { $ne: ['$listStore.listOrder.date', null] },
            then: {
              $dateToString: {
                date: {
                  $dateAdd: {
                    startDate: '$listStore.listOrder.date',
                    unit: 'hour',
                    amount: 7
                  }
                },
                format: '%Y-%m-%d %H:%M:%S',
                timezone: 'Asia/Bangkok'
              }
            },
            else: ''
          }
        }
      }
    }
  ])

  // const io = getSocket()
  // io.emit('order/getSaleSummaryByStore', {});

  res.status(200).json({
    status: 200,
    message: 'sucess',
    data: routeData
  })
}

exports.getGroup = async (req, res) => {
  const channel = req.headers['x-channel']
  const { Product } = getModelsByChannel(channel, res, productModel)
  const product = await Product.aggregate([
    // {
    // $match: {
    //   groupM3: { $nin: ['', null] }
    // }
    // },
    {
      $group: {
        _id: {
          groupCode: '$groupCode',
          group: '$group'
        }
      }
    },
    {
      $project: {
        _id: 0,
        groupCode: '$_id.groupCode',
        group: '$_id.group'
      }
    },
    {
      $sort: { groupCode: 1 } // ✅ เรียงตาม groupCode
    }
  ])

  res.status(200).json({
    message: 'Success',
    data: product
  })
}

exports.getSummaryProduct = async (req, res) => {
  const { zone } = req.query

  const channel = req.headers['x-channel']

  const { Route } = getModelsByChannel(channel, res, routeModel)
  const { Product } = getModelsByChannel(channel, res, productModel)
  const { User } = getModelsByChannel(channel, res, userModel)
  const { Store } = getModelsByChannel(channel, res, storeModel)

  const route = await Route.aggregate([
    {
      $addFields: {
        shortArea: { $substr: ['$area', 0, 2] }
      }
    },
    {
      $match: {
        shortArea: zone
      }
    },
    { $unwind: { path: '$listStore', preserveNullAndEmptyArrays: true } },
    {
      $unwind: {
        path: '$listStore.listOrder',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $addFields: {
        storeObjId: { $toObjectId: '$listStore.storeInfo' }
      }
    },
    {
      $lookup: {
        from: 'orders',
        localField: 'listStore.listOrder.orderId',
        foreignField: 'orderId',
        as: 'order'
      }
    },
    {
      $match: {
        $expr: { $gt: [{ $size: '$order' }, 0] }
      }
    },
    {
      $project: {
        order: 1
      }
    },
    { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
    {
      $unwind: { path: '$order.listProduct', preserveNullAndEmptyArrays: true }
    },
    {
      $project: {
        _id: 0,
        store: '$order.store.storeId',
        area: '$order.store.area',
        productId: '$order.listProduct.id',
        group: '$order.listProduct.group',
        size: '$order.listProduct.size',
        unit: '$order.listProduct.unit',
        qty: '$order.listProduct.qty'
      }
    }
  ])

  // console.log("route",route)

  const productId = route.flatMap(u => u.productId)

  const productFactor = await Product.aggregate([
    {
      $match: {
        id: { $in: productId }
      }
    },
    { $unwind: { path: '$listUnit', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        productId: '$id',
        group: '$listUnit.group',
        size: '$listUnit.size',
        unit: '$listUnit.unit',
        factor: '$listUnit.factor'
      }
    }
  ])

  const productQty = route.map(u => {
    const qty =
      productFactor.find(
        i => i.productId === u.productId && i.unit == u.unit
      ) || {}
    const factorPcs = u.qty * qty.factor
    const factorCtn =
      productFactor.find(i => i.productId === u.productId && i.unit == 'CTN') ||
      {}
    const qtyCtn = Math.floor(factorPcs / factorCtn.factor)

    return {
      store: u.store,
      area: u.area,
      productId: u.productId,
      group: u.group,
      size: u.size,
      unit: 'CTN',
      qty: qtyCtn
    }
  })

  const grouped = []

  productQty.forEach(item => {
    const existing = grouped.find(
      g =>
        g.store === item.store &&
        g.area === item.area &&
        g.productId === item.productId &&
        g.group === item.group &&
        g.size === item.size &&
        g.unit === item.unit
    )

    if (existing) {
      existing.qty += item.qty
    } else {
      grouped.push({ ...item })
    }
  })
  const product = await Product.aggregate([
    {
      $addFields: {
        groupSize: {
          $concat: ['$group', ' ', '$size']
        }
      }
    },
    {
      $group: {
        _id: {
          productId: '$id',
          groupCode: '$groupSize'
        }
      }
    },
    {
      $project: {
        _id: 0,
        productId: '$_id.productId',
        groupSize: '$_id.groupCode'
      }
    }
  ])

  const area = await User.aggregate([
    {
      $addFields: {
        shortArea: { $substr: ['$area', 0, 2] }
      }
    },
    {
      $match: {
        shortArea: zone
      }
    },
    {
      $group: {
        _id: '$area'
      }
    },
    {
      $project: {
        _id: 0,
        area: '$_id'
      }
    }
  ])

  if (area.length == 0) {
    return res.status(404).json({
      status: 404,
      message: 'Not found zone'
    })
  }

  const result = area.map(({ area }) => {
    return product.map(product => ({
      ...product,
      area
    }))
  })

  // ถ้าอยากให้เป็น flat array (ไม่เป็นกลุ่ม area): ใช้ .flat()
  const areaProduct = result.flat()

  const countStore = []

  grouped.forEach(item => {
    const existing = countStore.find(
      g =>
        g.store === item.store &&
        g.area === item.area &&
        g.productId === item.productId &&
        g.unit === item.unit
    )
    if (existing) {
      existing.count += 1 // เพิ่มจำนวนที่เจอซ้ำ
    } else {
      countStore.push({
        store: item.store,
        area: item.area,
        productId: item.productId,
        unit: item.unit,
        count: 1 // เริ่มต้นนับเป็น 1
      })
    }
  })

  const constStoreOnArea = await Store.aggregate([
    {
      $match: {
        status: { $ne: 'delete' }
      }
    },
    {
      $group: {
        _id: '$area',
        storeIds: { $addToSet: '$storeId' } // เก็บ storeId ที่ไม่ซ้ำใน array
      }
    },
    {
      $project: {
        area: '$_id',
        constStore: { $size: '$storeIds' }, // นับจำนวน storeId ที่ไม่ซ้ำ
        _id: 0
      }
    }
  ])

  const productTran = areaProduct.map(item => {
    const productDetail = grouped.find(
      u => u.productId == item.productId && u.area == item.area
    )
    // if (productDetail && productDetail.qty > 1) {
    //   console.log(item.groupSize)
    //   console.log('item', productDetail)
    // }

    const storeCount = countStore.find(
      u => u.productId == item.productId && u.area == item.area
    )
    const allStoreCount = constStoreOnArea.find(u => u.area == item.area)

    const percentStore = allStoreCount?.constStore
      ? (((storeCount?.count || 0) / allStoreCount.constStore) * 100).toFixed(2)
      : 0

    return {
      // productId: item.productId,
      area: item.area,
      [`TRAGET ${item.groupSize}`]: 0,
      [`SELL ${item.groupSize}`]: productDetail?.qty || 0,
      [`PERCENT ${item.groupSize}`]: 0,
      [`TRAGET_STORE ${item.groupSize}`]: 0,
      [`STORE ${item.groupSize}`]: storeCount?.count || 0,
      [`PERCENT_STORE ${item.groupSize}`]: Number(percentStore)
    }
  })

  const areaId = [...new Set(productTran.map(u => u.area))].map(area => ({
    area
  }))

  const data = areaId.map(item => {
    const productDetail = productTran.filter(u => u.area === item.area)

    const mergedDetail = productDetail.reduce((acc, curr) => {
      const { area, ...rest } = curr

      return { ...acc, ...rest }
    }, {})

    return {
      area: item.area,
      ...mergedDetail
    }
  })

  const summaryTarget = productTran.reduce((sum, item) => {
    const key = Object.keys(item).find(
      k => k.startsWith('TRAGET ') && !k.includes('TRAGET STORE')
    )
    return sum + (item[key] || 0)
  }, 0)

  const summarySell = productTran.reduce((sum, item) => {
    const key = Object.keys(item).find(k => k.startsWith('SELL '))
    return sum + (item[key] || 0)
  }, 0)

  const summaryPercent = productTran.reduce((sum, item) => {
    const key = Object.keys(item).find(
      k => k.startsWith('PERCENT ') && !k.includes('PERCENT STORE')
    )
    return sum + (item[key] || 0)
  }, 0)

  const summaryTargetStore = productTran.reduce((sum, item) => {
    const key = Object.keys(item).find(k => k.startsWith('TRAGET STORE '))
    return sum + (item[key] || 0)
  }, 0)

  const summaryStore = productTran.reduce((sum, item) => {
    const key = Object.keys(item).find(k => k.startsWith('STORE '))
    return sum + (item[key] || 0)
  }, 0)

  const totalStoreCount = productTran.reduce((sum, item) => {
    const key = Object.keys(item).find(k => k.startsWith('STORE '))
    return sum + (item[key] || 0)
  }, 0)

  const totalAllStoreCount = constStoreOnArea.reduce((sum, item) => {
    return sum + (item.constStore || 0)
  }, 0)

  const summaryPercentStore =
    totalAllStoreCount > 0
      ? Number(((totalStoreCount / totalAllStoreCount) * 100).toFixed(2))
      : 0

  const dataTran = {
    data,
    summaryTarget: summaryTarget,
    summarySell: summarySell,
    summaryPercent: summaryPercent,
    summaryTargetStore: summaryTargetStore,
    summaryStore: summaryStore,
    summaryPercentStore: summaryPercentStore
  }

  // const io = getSocket()
  // io.emit('order/getSummaryProduct', {});

  res.status(200).json({
    status: 200,
    message: 'Success',
    ...dataTran
  })
}

exports.getProductLimit = async (req, res) => {
  const { storeId, area, type } = req.query
  const channel = req.headers['x-channel']
  const { Cart } = getModelsByChannel(channel, res, cartModel)
  const { User } = getModelsByChannel(channel, res, userModel)
  const { Product } = getModelsByChannel(channel, res, productModel)
  const { Sendmoney } = getModelsByChannel(channel, res, sendmoneyModel)
  const { PromotionLimit } = getModelsByChannel(channel, res, promotionModel)
  const cart = await Cart.findOne({ type, area, storeId })
  if (!cart || cart.listProduct.length === 0) {
    return res.status(404).json({ status: 404, message: 'Cart is empty!' })
  }

  const productLimit = cart.listPromotion.map(item => {
    return {
      proId: item.proId
    }
  })
  let productLimitList = []
  for (const i of productLimit) {
    const productLimitDetail = await PromotionLimit.findOne({ proId: i.proId })
    productLimitList.push(productLimitDetail)
  }

  res.status(200).json({
    status: 200,
    message: productLimitList
  })
}

exports.summaryAllProduct = async (req, res) => {
  const { area, period } = req.query
  const channel = req.headers['x-channel']
  const { Product } = getModelsByChannel(channel, res, productModel)
  const { Stock } = getModelsByChannel(channel, res, stockModel)

  const dataStock = await Stock.findOne({
    area: area,
    period: period
  })

  if (dataStock == 0) {
    return res.status(404).json({
      status: 404,
      message: 'Not found Stock'
    })
  }

  const productId = dataStock.listProduct.flatMap(item => item.productId)

  const dataProduct = await Product.aggregate([
    {
      $match: {
        id: { $in: productId }
      }
    },
    { $unwind: '$listUnit' },
    {
      $project: {
        _id: 0,
        id: 1,
        listUnit: 1
      }
    }
  ])

  let sumPrice = 0

  for (const item of dataStock.listProduct) {
    const getPcs =
      dataProduct.find(
        u => u.id == item.productId && u.listUnit.unit == 'PCS'
      ) || {}
    // const getCtn = dataProduct.find(u => u.id == item.productId && u.listUnit.unit == 'CTN') || {}
    if (getPcs && getPcs.listUnit && getPcs.listUnit.price.sale) {
      sumPrice += item.balancePcs * getPcs.listUnit.price.sale
    }
    // if (getCtn && getCtn.listUnit && getCtn.listUnit.price.sale) {
    //   sumPrice += item.balanceCtn * getCtn.listUnit.price.sale;
    // }
  }

  // const io = getSocket()
  // io.emit('order/summaryAllProduct', {});

  res.status(200).json({
    status: 200,
    message: 'sucess',
    data: sumPrice
  })
}

exports.summaryDaily = async (req, res) => {
  try {
    const { area } = req.query
    const channel = req.headers['x-channel']
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)

    // รับ period และคำนวณปี เดือน
    const periodStr = period()
    const year = Number(periodStr.substring(0, 4))
    const month = Number(periodStr.substring(4, 6))

    // หาช่วงเวลา UTC ของเดือนที่ต้องการ (แปลงจากเวลาไทย)
    const thOffset = 7 * 60 * 60 * 1000
    const startOfMonthTH = new Date(year, month - 1, 1, 0, 0, 0, 0)
    const endOfMonthTH = new Date(year, month, 0, 23, 59, 59, 999)
    const startOfMonthUTC = new Date(startOfMonthTH.getTime() - thOffset)
    const endOfMonthUTC = new Date(endOfMonthTH.getTime() - thOffset)

    // ฟังก์ชันสำหรับแปลงวันที่เป็น dd/mm/yyyy ตามเวลาไทย
    const getDateStrTH = dateUTC => {
      const dateTH = new Date(new Date(dateUTC).getTime() + thOffset)
      const day = dateTH.getDate().toString().padStart(2, '0')
      const mon = (dateTH.getMonth() + 1).toString().padStart(2, '0')
      const yr = dateTH.getFullYear()
      return `${day}/${mon}/${yr}`
    }
    const [dataSendmoney, dataRefund, dataOrderSale, dataOrderChange] =
      await Promise.all([
        // SendMoney.find({
        //   area: area,
        //   dateAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
        // }),
        SendMoney.aggregate([
          {
            $match: {
              area: area,
              dateAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC }
            }
          },
          {
            $addFields: {
              createdAt: '$dateAt'
            }
          }
        ]),
        Refund.find({
          'store.area': area,
          period: periodStr,
          createdAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
          type: 'refund',
          status: { $nin: ['canceled', 'delete'] }
        }),
        Order.find({
          'store.area': area,
          period: periodStr,
          createdAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
          type: 'sale',
          status: { $nin: ['canceled'] }
        }),
        Order.find({
          'store.area': area,
          period: periodStr,
          createdAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
          type: 'change',
          status: { $nin: ['canceled'] }
        })
      ])

    // รวม summary และ status ต่อวันจาก sendmoney
    const sumByDate = dataSendmoney.reduce((acc, item) => {
      const dateStr = getDateStrTH(item.createdAt)
      if (!acc[dateStr]) {
        acc[dateStr] = { summary: 0, status: item.status || '' }
      }
      acc[dateStr].summary += item.sendmoney || 0
      // acc[dateStr].status = item.status; // ถ้าอยากใช้ status อันสุดท้ายในวันนั้น
      return acc
    }, {})

    // ทำให้ array พร้อม map สำหรับ summary กับ status
    const dataSendMoneyTran = Object.entries(sumByDate).map(([date, val]) => ({
      date,
      summary: val.summary,
      status: val.status
    }))
    // console.log(dataSendMoneyTran)
    const sendMoneyMap = Object.fromEntries(
      dataSendMoneyTran.map(d => [d.date, d.summary])
    )
    const statusMap = Object.fromEntries(
      dataSendMoneyTran.map(d => [d.date, d.status])
    )

    // สร้างรายการ refund แบบแบน
    const refundListFlat = dataRefund.flatMap(item =>
      item.listProduct.map(u => ({
        price: u.total,
        condition: u.condition,
        date: getDateStrTH(item.createdAt)
      }))
    )
    const refundByDate = refundListFlat.reduce((acc, r) => {
      if (!acc[r.date]) acc[r.date] = []
      acc[r.date].push(r)
      return acc
    }, {})

    const orderSaleListFlat = dataOrderSale.flatMap(item =>
      item.listProduct.map(u => ({
        price: u.netTotal,
        date: getDateStrTH(item.createdAt)
      }))
    )

    const orderChangeListFlat = dataOrderChange.flatMap(item =>
      item.listProduct.map(u => ({
        price: u.netTotal,
        date: getDateStrTH(item.createdAt)
      }))
    )

    // Group by date
    const saleByDate = orderSaleListFlat.reduce((acc, o) => {
      acc[o.date] = (acc[o.date] || 0) + Number(o.price || 0)
      return acc
    }, {})

    const changeByDate = orderChangeListFlat.reduce((acc, o) => {
      acc[o.date] = (acc[o.date] || 0) + Number(o.price || 0)
      return acc
    }, {})

    // เตรียม array วันที่ครบทั้งเดือน
    const lastDay = new Date(year, month, 0).getDate()
    const allDateArr = Array.from(
      { length: lastDay },
      (_, i) =>
        `${(i + 1).toString().padStart(2, '0')}/${month
          .toString()
          .padStart(2, '0')}/${year}`
    )

    // สร้างผลลัพธ์รายวัน (ใส่ 0 ถ้าไม่มีข้อมูล)
    const fullMonthArr = allDateArr.map(date => {
      const sendmoneyRaw = sendMoneyMap[date] || 0
      const sendmoney = to2(sendmoneyRaw)
      let status = ''
      const refundTodayRaw = refundByDate[date] || []
      const refundToday = refundTodayRaw
      const goodRaw = refundToday
        .filter(x => x.condition === 'good')
        .reduce((sum, x) => sum + Number(x.price), 0)
      const good = to2(goodRaw)
      const damagedRaw = refundToday
        .filter(x => x.condition === 'damaged')
        .reduce((sum, x) => sum + Number(x.price), 0)
      const damaged = to2(damagedRaw)
      // เพิ่ม sale และ change
      const summaryRaw = saleByDate[date] || 0

      const changeRaw = changeByDate[date] || 0
      const change = to2(changeRaw)
      const diffChange = to2(change - damaged - good)

      const summary = to2(summaryRaw + diffChange)
      const diffRaw = sendmoney - summary
      const diff = to2(diffRaw)
      if (sendmoney > 0) {
        status = 'ส่งเงินแล้ว'
      } else {
        status = 'ยังไม่ส่งเงิน'
      }

      return {
        date,
        sendmoney,
        summary,
        diff,
        change,
        status,
        good,
        damaged,
        diffChange
      }
    })

    const sumSendMoney = fullMonthArr.reduce((sum, item) => {
      return sum + (item.sendmoney || 0)
    }, 0)

    const sumSummary = fullMonthArr.reduce((sum, item) => {
      return sum + (item.summary || 0)
    }, 0)

    const sumSummaryDif = fullMonthArr.reduce((sum, item) => {
      return sum + (item.diff || 0)
    }, 0)

    const sumChange = fullMonthArr.reduce((sum, item) => {
      return sum + (item.change || 0)
    }, 0)
    const sumGood = fullMonthArr.reduce((sum, item) => {
      return sum + (item.good || 0)
    }, 0)
    const sumDamaged = fullMonthArr.reduce((sum, item) => {
      return sum + (item.damaged || 0)
    }, 0)

    const diffChange = fullMonthArr.reduce((sum, item) => {
      return sum + (item.diffChange || 0)
    }, 0)

    // const io = getSocket()
    // io.emit('order/summaryDaily', {});

    res.status(200).json({
      status: 200,
      message: 'success',
      data: fullMonthArr,
      sumSendMoney: to2(sumSendMoney),
      sumSummary: to2(sumSummary),
      sumSummaryDif: to2(Math.abs(sumSummary - sumSendMoney)),
      sumChange: to2(sumChange),
      sumGood: to2(sumGood),
      sumDamaged: to2(sumDamaged),
      diffChange: to2(diffChange)
    })
  } catch (err) {
    res.status(500).json({ status: 500, message: err.message })
  }
}
exports.summaryMonthlyByZone = async (req, res) => {
  try {
    // รับ areas ได้จาก query (เช่น areas=BE215,BE221) หรือจาก body
    const areas = (req.query.areas || '').split(',').filter(Boolean)
    if (!areas.length)
      return res
        .status(400)
        .json({ status: 400, message: 'areas is required!' })

    const channel = req.headers['x-channel']
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)

    const periodStr = period()
    const year = Number(periodStr.substring(0, 4))
    const month = Number(periodStr.substring(4, 6))
    const thOffset = 7 * 60 * 60 * 1000
    const startOfMonthTH = new Date(year, month - 1, 1, 0, 0, 0, 0)
    const endOfMonthTH = new Date(year, month, 0, 23, 59, 59, 999)
    const startOfMonthUTC = new Date(startOfMonthTH.getTime() - thOffset)
    const endOfMonthUTC = new Date(endOfMonthTH.getTime() - thOffset)

    // ถ้าคุณมีฟังก์ชัน to2 ให้ใส่ไว้ข้างบนนี้ได้เลย
    // function to2(num) { return Math.round((num + Number.EPSILON) * 100) / 100 }

    const result = []

    for (const area of areas) {
      const [dataSendmoney, dataRefund, dataOrderSale, dataOrderChange] =
        await Promise.all([
          SendMoney.aggregate([
            {
              $match: {
                area: area,
                dateAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC }
              }
            },
            { $addFields: { createdAt: '$dateAt' } }
          ]),
          Refund.find({
            'store.area': area,
            period: periodStr,
            createdAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
            type: 'refund',
            status: { $nin: ['canceled', 'delete'] }
          }),
          Order.find({
            'store.area': area,
            period: periodStr,
            createdAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
            type: 'sale',
            status: { $nin: ['canceled'] }
          }),
          Order.find({
            'store.area': area,
            period: periodStr,
            createdAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
            type: 'change',
            status: { $nin: ['canceled'] }
          })
        ])

      // ===== Sum ข้อมูลทั้งเดือน =====
      const sumSendmoney = dataSendmoney.reduce(
        (sum, item) => sum + (item.sendmoney || 0),
        0
      )
      const status = sumSendmoney > 0 ? 'ส่งเงินแล้ว' : 'ยังไม่ส่งเงิน'

      const refundListFlat = dataRefund.flatMap(item =>
        item.listProduct.map(u => ({
          price: u.total,
          condition: u.condition
        }))
      )
      const good = refundListFlat
        .filter(x => x.condition === 'good')
        .reduce((sum, x) => sum + Number(x.price), 0)
      const damaged = refundListFlat
        .filter(x => x.condition === 'damaged')
        .reduce((sum, x) => sum + Number(x.price), 0)

      const orderSaleListFlat = dataOrderSale.flatMap(item =>
        item.listProduct.map(u => ({
          price: u.netTotal
        }))
      )
      const summary = orderSaleListFlat.reduce(
        (sum, o) => sum + Number(o.price || 0),
        0
      )

      const orderChangeListFlat = dataOrderChange.flatMap(item =>
        item.listProduct.map(u => ({
          price: u.netTotal
        }))
      )
      const change = orderChangeListFlat.reduce(
        (sum, o) => sum + Number(o.price || 0),
        0
      )

      const diff = sumSendmoney - summary

      result.push({
        area,
        monthly: {
          sendmoney: to2(sumSendmoney),
          summary: to2(summary),
          diff: to2(diff),
          change: to2(change),
          status,
          good: to2(good),
          damaged: to2(damaged)
        }
      })
    }

    res.status(200).json({
      status: 200,
      message: 'success',
      data: result
    })
  } catch (err) {
    res.status(500).json({ status: 500, message: err.message })
  }
}

exports.saleReport = async (req, res) => {
  const { area, type, date, role } = req.query
  const channel = req.headers['x-channel']
  const { Order } = getModelsByChannel(channel, res, orderModel)
  const { Refund } = getModelsByChannel(channel, res, refundModel)

  // const dataRefund = await Refund.find({
  //   // ...filterArea,
  //   // ...filterCreatedAt,
  //   // status: { $ne: "canceled" }
  // })

  // console.log(dataRefund)

  if (role == 'sale' || role == '' || !role) {
    let filterCreatedAt = {}
    let filterArea = {}
    let filterType = {}
    if (area) {
      filterArea = { 'store.area': area }
    }
    if (type) {
      filterType = { type: type }
    }
    if (date) {
      const year = Number(date.substring(0, 4))
      const month = Number(date.substring(4, 6)) - 1
      const day = Number(date.substring(6, 8))

      // เวลาตาม timezone ไทย
      const startDateUTC = new Date(Date.UTC(year, month, day, 0, 0, 0)) // 2025-08-01T17:00:00Z
      const endDateUTC = new Date(Date.UTC(year, month, day + 1, 0, 0, 0) - 1) // 2025-08-02T16:59:59.999Z
      filterCreatedAt = {
        createdAt: {
          $gte: startDateUTC,
          $lt: endDateUTC
        }
      }
    }
    const dataOrder = await Order.find({
      ...filterArea,
      ...filterCreatedAt,
      status: { $ne: 'canceled' }
    })

    const dataRefund = await Refund.find({
      ...filterArea,
      ...filterCreatedAt,
      status: { $ne: 'canceled' }
    })

    if (dataOrder.length === 0) {
      return res.status(404).json({
        status: 404,
        message: 'Not found Order'
      })
    }
    const data = [...dataOrder].map(item => {
      let paymentMethodTH = ''
      if (item.paymentMethod === 'cash') {
        paymentMethodTH = 'เงินสด'
      } else if (item.paymentMethod === 'qr') {
        paymentMethodTH = 'QR Payment'
      } else {
        paymentMethodTH = item.paymentMethod
      }

      // เช็คว่าเป็น refund หรือไม่
      const isRefund = item.type === 'refund'
      const totalWithSign = isRefund ? -Math.abs(item.total) : item.total

      return {
        type: item.type,
        orderId: item.orderId,
        saleCode: item.sale.saleCode,
        saleName: item.sale.name,
        storeId: item.store.storeId,
        storeName: item.store.name,
        storeTaxId: item.store.taxId,
        total: totalWithSign,
        paymentMethod: paymentMethodTH
      }
    })
    res.status(200).json({
      status: 200,
      message: 'sucess',
      data: data
    })
  } else if (role == 'supervisor') {
    const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)
    let areaQuery = {}
    if (area) {
      if (area.length == 2) {
        areaQuery.zone = area.slice(0, 2)
      } else if (area.length == 5) {
        areaQuery.area = area
      }
    }

    const sendMoneyData = await SendMoney.aggregate([
      {
        $addFields: {
          zone: { $substrBytes: ['$area', 0, 2] }
        }
      },
      {
        $match: {
          ...areaQuery
        }
      }
    ])

    // const io = getSocket()
    // io.emit('order/saleReport', {});

    res.status(200).json({
      status: 200,
      // sendMoneyData
    })
  }
}

exports.getSummary18SKU = async (req, res) => {
  const { zone, area, team } = req.query
  const channel = req.headers['x-channel']
  const { Order } = getModelsByChannel(channel, res, orderModel)
  const { Product } = getModelsByChannel(channel, res, productModel)

  const matchStage = {}
  if (zone) matchStage['store.zone'] = zone
  if (area) matchStage['store.area'] = area
  if (team) matchStage['team'] = team
  // console.log(team)
  const dataOrder = await Order.aggregate([
    { $match: { status: { $ne: 'canceled' } } },
    {
      $addFields: {
        team: {
          $concat: [
            { $substr: ['$store.area', 0, 2] }, // 2 ตัวแรก
            { $substr: ['$store.area', 3, 1] } // ตัวที่ 4 (index เริ่ม 0)
          ]
        }
      }
    },
    { $match: matchStage },
    { $match: { team: { $ne: '' } } },
    { $unwind: '$listProduct' },
    { $replaceRoot: { newRoot: '$listProduct' } }
  ])

  // console.log(dataOrder)
  const productlist = dataOrder.map(item => item.id) // หรือ flatMap ถ้าเป็น array
  const productId = [...new Set(productlist)]
  const productData = await Product.find({ id: { $in: productId } })

  const emptyGroup = await Product.aggregate([
    {
      $match: {
        group: { $nin: ['สินค้าช่วยระบาย'] },
        groupCodeM3: { $nin: [''] }
      }
    },
    {
      $group: {
        _id: {
          groupCode: '$groupCode',
          group: '$group',
          groupCodeM3: '$groupCode'
        }
      }
    },
    { $replaceRoot: { newRoot: '$_id' } },
    {
      $addFields: {
        summaryQty: 0,
        summary: 0
      }
    }
  ])
  // console.log(emptyGroup)

  data = []
  for (const item of dataOrder) {
    const productDetail = productData.find(i => item.id === i.id)
    const unit = productDetail.listUnit.find(u => item.unit === u.unit)
    const factorPcs = unit.factor
    dataTran = {
      groupCode: productDetail.groupCode,
      // groupCodeM3: productDetail.groupCodeM3,
      group: productDetail.group,
      summaryQty: item.qty * factorPcs,
      summary: item.netTotal
    }
    data.push(dataTran)
  }

  const mergedGroup = emptyGroup.map(group => {
    const groupItems = data.filter(
      item =>
        item.groupCode === group.groupCode &&
        item.group === group.group &&
        item.groupCode === group.groupCode
    )
    const summaryQtySum = groupItems.reduce((sum, i) => sum + i.summaryQty, 0)
    const summarySum = groupItems.reduce((sum, i) => sum + i.summary, 0)

    return {
      ...group,
      summaryQty: Number(summaryQtySum.toFixed(2)),
      summary: Number(summarySum.toFixed(2))
    }
  })

  const sortedMergedGroup = mergedGroup.sort((a, b) => {
    if (!a.groupCodeM3) return 1
    if (!b.groupCodeM3) return -1
    return a.groupCodeM3.localeCompare(b.groupCodeM3, undefined, {
      numeric: true
    })
  })

  //  const io = getSocket()
  //   io.emit('order/getSummary18SKU', {});

  res.status(200).json({
    status: 200,
    // data: data,
    data: sortedMergedGroup
  })
}

exports.reportCheckin = async (req, res) => {
  const { zone, area, period } = req.body
  const channel = req.headers['x-channel']
  const { Store } = getModelsByChannel(channel, res, storeModel)
  const { Order } = getModelsByChannel(channel, res, orderModel)
  const { Product } = getModelsByChannel(channel, res, productModel)
  let match = {}
  if (zone) {
    match['store.zone'] = zone
  }

  if (area) {
    match['store.area'] = area
  }

  const dataOrder = await Order.aggregate([
    { $match: match },
    {
      $match: {
        period: period
      }
    },
    {
      $project: {
        store: 1,
        listProduct: 1, // เอา listProduct หลักออกมา
        promotionProducts: {
          $reduce: {
            input: '$listPromotions',
            initialValue: [],
            in: {
              $concatArrays: ['$$value', '$$this.listProduct']
            }
          }
        },
        createdAt: 1
      }
    }
  ])

  const { startDate, endDate } = rangeDate(period)

  const dates = generateDateList(startDate, endDate)
  const areaAll = await Store.aggregate([
    {
      $match: {
        area: { $ne: null, $ne: '' }
      }
    },
    {
      $group: {
        _id: '$area'
      }
    },
    {
      $sort: { _id: 1 }
    }
  ])

  const saleProductId = dataOrder.flatMap(i =>
    i.listProduct.map(item => item.id)
  )
  const promoProductId = dataOrder.flatMap(i =>
    i.promotionProducts.map(item => item.id)
  )

  const productIdUnique = [...new Set([...saleProductId, ...promoProductId])]

  const productList = await Product.find({ id: { $in: productIdUnique } })

  const newDataOrder = dataOrder.map(order => {
    const newListProduct = (order.listProduct || []).map(item => {
      const productDetail = productList.find(i => i.id === item.id)
      const productUnit =
        productDetail?.listUnit.find(i => i.unit === item.unit)?.factor || 1
      const productUnitCtn =
        productDetail?.listUnit.find(i => i.unit === 'CTN')?.factor || 0
      const qtyPcs = item.qty * productUnit
      const qtyCtn =
        productUnitCtn > 0 ? Math.floor(qtyPcs / productUnitCtn) : 0

      return {
        ...item,
        qtyCtn
      }
    })

    const newPromotionProducts = (order.promotionProducts || []).map(item => {
      const productDetail = productList.find(i => i.id === item.id)
      const productUnit =
        productDetail?.listUnit.find(i => i.unit === item.unit)?.factor || 1
      const productUnitCtn =
        productDetail?.listUnit.find(i => i.unit === 'CTN')?.factor || 0
      const qtyPcs = item.qty * productUnit
      const qtyCtn =
        productUnitCtn > 0 ? Math.floor(qtyPcs / productUnitCtn) : 0

      return {
        ...item,
        qtyCtn
      }
    })

    return {
      ...order,
      listProduct: newListProduct,
      promotionProducts: newPromotionProducts
    }
  })

  // console.log(newDataOrder)

  const areaList = areaAll.map(item => item._id)
  for (const i of dates) {
    const orderDetails = newDataOrder.filter(item => {
      const itemDateStr = new Date(item.createdAt).toISOString().slice(0, 10)
      return itemDateStr === i
    })

    const daily = {
      date: i,
      areas: orderDetails.map(u => u.area === areaList)
    }

    // console.log(daily)
  }

  res.status(200).json({
    status: 200,
    message: 'sucess',
    data: newDataOrder
  })
}
