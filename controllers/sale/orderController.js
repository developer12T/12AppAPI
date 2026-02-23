const {
  dataPowerBiQuery,
  dataM3Query,
  dataPowerBiQueryDelete,
  dataPowerBiQueryInsert,
  dataWithdrawInsert
} = require('../../controllers/queryFromM3/querySctipt')
const {
  period,
  previousPeriod,
  toThaiTime,
  rangeDate
} = require('../../utilities/datetime')
const axios = require('axios')
const dayjs = require('dayjs')
const {
  getSeries,
  updateRunningNumber,
  getOrders,
  getChange,
  getRefund
} = require('../../middleware/order')

const { restock } = require('../../middleware/stock')
const { Item } = require('../../models/item/itemlot')
const {
  OOHEAD,
  ItemLotM3,
  OOLINE,
  DisributionM3,
  MHDISL,
  MHDISH,
  MGLINE
} = require('../../models/cash/master')
const { WithdrawCash } = require('../../models/cash/powerBi')
const { Op, fn, col, where, literal } = require('sequelize')
const {
  generateOrderId,
  generateOrderIdFoodTruck
} = require('../../utilities/genetateId')
const { sortProduct } = require('../../utilities/product')
const {
  summaryOrder,
  summaryOrderProStatusOne
} = require('../../utilities/summary')
// const { fn, col } = require('sequelize')
const { sequelize, DataTypes } = require('../../config/m3db')
const { uploadFiles } = require('../../utilities/upload')
const { checkInRoute, checkInSale } = require('../route/checkIn')
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
const sendmoneyModel = require('../../models/cash/sendmoney')
const orderModel = require('../../models/cash/sale')
const cartModel = require('../../models/cash/cart')
const userModel = require('../../models/cash/user')
const productModel = require('../../models/cash/product')
const routeModel = require('../../models/cash/route')
const giveModel = require('../../models/cash/give')
const targetModel = require('../../models/cash/target')
const promotionModel = require('../../models/cash/promotion')
const distributionModel = require('../../models/cash/distribution')
const refundModel = require('../../models/cash/refund')
const storeModel = require('../../models/cash/store')
const targetProductModel = require('../../models/cash/targetProduct')
const { getModelsByChannel } = require('../../middleware/channel')
const {
  formatDateTimeToThai,
  dataPowerBi,
  dataWithdraw
} = require('../../middleware/order')

const xlsx = require('xlsx')
const path = require('path')
const os = require('os')
const fs = require('fs')
const target = require('../../models/cash/target')
const product = require('../../models/cash/product')
const { stat } = require('fs/promises')

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
      listPromotion
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
    const ONE_MINUTE = 2 * 1000

    if (now - lastUpdate < ONE_MINUTE) {
      return res.status(429).json({
        status: 429,
        message:
          'This order was updated less than 2 seconds ago. Please try again later!'
      })
    }
    orderTimestamps[storeId] = now

    setTimeout(() => {
      delete orderTimestamps[storeId]
    }, ONE_MINUTE)

    const cart = await Cart.findOne({ type, area, storeId })

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

    // let summary = ''
    // if (changePromotionStatus == 0) {
    //   summary = await summaryOrder(cart, channel, res)
    // } else if (changePromotionStatus == 1) {
    //   summary = await summaryOrderProStatusOne(
    //     cart,
    //     listPromotion,
    //     channel,
    //     res
    //   )
    //   // res.json(summary); // return ตรงนี้เลย
    // }
    // console.log("changePromotionStatus",changePromotionStatus)
    // console.log(listPromotion)
    let promotion = []
    if (changePromotionStatus === 1) {
      promotion = listPromotion
    } else if (channel === 'pc') {
      promotion = cart.listPromotionSelect
    } else {
      promotion = cart.listPromotion
    }
    // console.log("promotion",promotion)
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

    // console.log(area)
    // console.log(sale)
    let orderId = {}
    if (channel === 'pc') {
      orderId = await generateOrderIdFoodTruck(
        area,
        sale.warehouse,
        channel,
        res
      )
    } else {
      orderId = await generateOrderId(area, sale.warehouse, channel, res)
    }

    let storeData = {}

    if (channel !== 'pc') {
      storeData =
        (await Store.findOne({
          storeId: cart.storeId,
          area: cart.area
        }).lean()) || {}
    }

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

    // ✅ ช่วยฟังก์ชัน: เช็คว่า createAt ตั้งแต่ Aug-2025 ขึ้นไปไหม
    function isAug2025OrLater(createAt) {
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

    // const addressFinal = `${storeData.address} ต.${storeData.subDistrict} อ.${storeData.district} จ.${province} ${postCode}`

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
        storeId: storeData.storeId || '',
        name: storeData.name || '',
        type: storeData.type || '',
        address: addressFinal || '',
        taxId: storeData.taxId || '',
        tel: storeData.tel || '',
        area: sale.area,
        zone: sale.zone
      },
      // shipping,
      // address,
      note,
      latitude,
      longitude,
      listProduct,

      listPromotions: promotion,

      // listQuota: summary.listQuota,
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
      paymentMethod: payment,
      paymentStatus: 'unpaid',
      createdBy: sale.username,
      period: period
    })
    // applyPromotionUsage(
    //   newOrder.store.storeId,
    //   newOrder.listPromotions,
    //   channel,
    //   res
    // )
    // console.log('checkOut', newOrder)

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

    // console.log(i)

    for (const item of qtyproductPro) {
      // console.log(item)
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

    // const createdMovement = await StockMovement.create({
    //   ...calStock
    // })

    // await StockMovementLog.create({
    //   ...calStock,
    //   refOrderId: createdMovement._id
    // })
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

    await restock(area, period, channel, 'update')

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

exports.checkOutSale = async (req, res) => {
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
      listPromotion
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

    setTimeout(() => {
      delete orderTimestamps[storeId]
    }, ONE_MINUTE)

    const cart = await Cart.findOne({ type, area, storeId })

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

    // let summary = ''
    // if (changePromotionStatus == 0) {
    //   summary = await summaryOrder(cart, channel, res)
    // } else if (changePromotionStatus == 1) {
    //   summary = await summaryOrderProStatusOne(
    //     cart,
    //     listPromotion,
    //     channel,
    //     res
    //   )
    //   // res.json(summary); // return ตรงนี้เลย
    // }
    // console.log("changePromotionStatus",changePromotionStatus)
    // console.log(listPromotion)
    let promotion = []
    if (changePromotionStatus === 1) {
      promotion = listPromotion
    } else {
      promotion = cart.listPromotion
    }
    // console.log("promotion",promotion)
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

    // console.log(area)
    // console.log(sale)
    let orderId = {}
    if (channel === 'pc') {
      orderId = await generateOrderIdFoodTruck(
        area,
        sale.warehouse,
        channel,
        res
      )
    } else {
      orderId = await generateOrderId(area, sale.warehouse, channel, res)
    }

    let storeData = {}

    if (channel !== 'pc') {
      storeData =
        (await Store.findOne({
          storeId: cart.storeId,
          area: cart.area
        }).lean()) || {}
    }

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

    // ✅ ช่วยฟังก์ชัน: เช็คว่า createAt ตั้งแต่ Aug-2025 ขึ้นไปไหม
    function isAug2025OrLater(createAt) {
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

    // const addressFinal = `${storeData.address} ต.${storeData.subDistrict} อ.${storeData.district} จ.${province} ${postCode}`

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
        storeId: storeData.storeId,
        name: storeData.name,
        type: storeData.type,
        address: addressFinal,
        taxId: storeData.taxId,
        tel: storeData.tel,
        area: sale.area,
        zone: sale.zone
      },
      // shipping,
      // address,
      note,
      latitude,
      longitude,
      listProduct,

      listPromotions: promotion,
      // listQuota: summary.listQuota,
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
      paymentMethod: payment,
      paymentStatus: 'unpaid',
      createdBy: sale.username,
      period: period
    })
    // applyPromotionUsage(
    //   newOrder.store.storeId,
    //   newOrder.listPromotions,
    //   channel,
    //   res
    // )

    const checkIn = await checkInSale(
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

    // console.log(i)

    for (const item of qtyproductPro) {
      // console.log(item)
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

    // const createdMovement = await StockMovement.create({
    //   ...calStock
    // })

    // await StockMovementLog.create({
    //   ...calStock,
    //   refOrderId: createdMovement._id
    // })
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

    await restock(area, period, channel, 'update')

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
    const { area, store, period, start, end, zone } = req.query
    let { type } = req.query
    const channel = req.headers['x-channel']

    const { Order } = getModelsByChannel(channel, res, orderModel)

    let response = []

    if (!type) {
      return res.status(400).json({ status: 400, message: 'type is required!' })
    }

    // ✅ คำนวณช่วงวัน
    let startDate, endDate

    if (start && end) {
      // ตัด string แล้ว parse เป็น Date
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

      // console.log(startDate,endDate)
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
      areaQuery['store.area'] = area
    } else if (zone) {
      areaQuery['store.zone'] = zone
    }

    // if (area) {
    //   if (area.length == 2) {
    //     areaQuery.zone = area.slice(0, 2)
    //   } else if (area.length == 5) {
    //     areaQuery['store.area'] = area
    //   }
    // }

    // let query = []
    // if (store) {
    //   query['store.storeId'] = store
    // }
    let typeCondition

    if (type === 'sale') {
      typeCondition = { $in: ['sale', 'saleNoodle'] }
    } else if (Array.isArray(type)) {
      typeCondition = { $in: type }
    } else if (type) {
      typeCondition = type // ค่าเดียว ไม่ต้องใช้ $in
    }

    const matchQuery = {
      ...(typeCondition ? { type: typeCondition } : {}),
      ...areaQuery,
      ...(store ? { 'store.storeId': store } : {}),
      ...(period ? { period } : {}),
      createdAt: { $gte: startDate, $lt: endDate }
    }


    // console.log(matchQuery)

    // console.log(matchQuery)

    // const order = await Order.aggregate([
    //   {
    //     $addFields: {
    //       zone: { $substrBytes: ['$store.area', 0, 2] }
    //     }
    //   },
    //   { $match: query }
    // ])

    const order = await Order.aggregate([
      // ทำ zone จาก store.area (ถ้าใช้กรองเขตระดับโซน)
      { $addFields: { zone: { $substrBytes: ['$store.area', 0, 2] } } },

      { $match: matchQuery },

      // นับความยาวต่างๆ ที่ต้องการในฝั่ง DB
      {
        $addFields: {
          listProductCount: {
            $size: { $ifNull: ['$listProduct', []] }
          },
          listPromotionCount: {
            $size: { $ifNull: ['$listPromotions', []] }
          },
          // นับจำนวนรายการใน listProduct ของ "แต่ละโปรโมชัน"
          // จะได้เป็น array เช่น [3, 1, 0, ...] ตามลำดับโปรโมชัน
          promoProductCounts: {
            $map: {
              input: { $ifNull: ['$listPromotions', []] },
              as: 'p',
              in: { $size: { $ifNull: ['$$p.listProduct', []] } }
            }
          },
          // รวมยอดจำนวนรายการ listProduct ทั้งหมดของทุกโปรโมชัน
          promoProductTotal: {
            $reduce: {
              input: {
                $map: {
                  input: { $ifNull: ['$listPromotions', []] },
                  as: 'p',
                  in: { $size: { $ifNull: ['$$p.listProduct', []] } }
                }
              },
              initialValue: 0,
              in: { $add: ['$$value', '$$this'] }
            }
          }
        }
      },

      // ตัดเหลือเฉพาะฟิลด์ที่ต้องส่งออก (ลด payload + ชัดเจน)
      {
        $project: {
          orderId: 1,
          orderNo: 1,
          number: 1,
          waiting: 1,
          lowStatus: 1,
          heightStatus: 1,
          lineM3: 1,
          store: 1,
          createdAt: 1,
          total: 1,
          paymentMethod: 1,
          paymentStatus: 1,
          status: 1,
          statusTH: 1,

          // fields ที่คำนวณไว้
          listProductCount: 1,
          listPromotionCount: 1,
          promoProductCounts: 1,
          promoProductTotal: 1
        }
      },

      // เรียงใหม่-ไป-เก่า ใน DB เลย
      { $sort: { createdAt: -1 } }
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

    response = order.map(o => ({
      orderId: o.orderId,
      orderNo: o.orderNo ?? '',
      number: o.number ?? 0,
      waiting: o.waiting ?? 0,
      lowStatus: o.lowStatus ?? '',
      heightStatus: o.heightStatus ?? '',
      lineM3: o.lineM3 ?? 0,

      area: o.store?.area ?? '',
      storeId: o.store?.storeId ?? '',
      storeName: o.store?.name ?? '',
      storeAddress: o.store?.address ?? '',

      createAt: o.createdAt, // (คุณมีทั้ง createAt/createdAt เลือกอันเดียวพอ)
      createdAt: o.createdAt,

      total: to2(o.total ?? 0),
      paymentMethod: o.paymentMethod ?? '',
      paymentStatus: o.paymentStatus ?? '',
      status: o.status ?? '',
      statusTH: o.statusTH ?? '',

      // จาก DB aggregation (เร็วและชัดกว่า .length ในโค้ด)
      listProduct: o.listProductCount ?? 0,
      listPromotion: o.listPromotionCount ?? 0,

      // เพิ่มตามที่ขอ: ความยาวของ listProduct ในแต่ละโปรโมชัน
      promoProductCounts: o.promoProductCounts ?? [], // ex. [3,1,0]
      promoProductTotal: o.promoProductTotal ?? 0 // ex. 4
    }))

    // const io = getSocket()
    // io.emit('order/all', {});
    if (channel === 'pc') {
      response.sort((a, b) => {
        // 1️⃣ ถ้า a เป็น success แต่ b ไม่ใช่ → เอา a ไปท้าย
        if (a.status === 'success' && b.status !== 'success') return 1
        // 2️⃣ ถ้า b เป็น success แต่ a ไม่ใช่ → เอา b ไปท้าย
        if (b.status === 'success' && a.status !== 'success') return -1
        // 3️⃣ ถ้า status เหมือนกัน → เรียงตาม number ปกติ
        return a.number - b.number
      })
    }

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

    const raw = doc.toObject ? doc.toObject() : doc
    if (!raw.shipping || raw.shipping === 0) {
      raw.shipping = {
        default: '',
        shippingId: '',
        address: '',
        district: '',
        subDistrict: '',
        province: '',
        postCode: '',
        latitude: '',
        longtitude: '',
        _id: ''
      }
    }

    const data = {
      ...raw,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      _source: source
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
    const { Route } = getModelsByChannel(channel, res, routeModel)

    const { Promotion } = getModelsByChannel(channel, res, promotionModel)
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Stock } = getModelsByChannel(channel, res, stockModel)
    const { Store } = getModelsByChannel(channel, res, storeModel)
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

    setTimeout(() => {
      delete orderUpdateTimestamps[orderId]
    }, ONE_MINUTE)
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
        await promotionDetail.save().catch(() => { }) // ถ้าเป็น doc ใหม่ต้อง .save()
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

    if (updatedOrder.routeId) {

      const storeData = await Store.findOne({ storeId: updatedOrder.store.storeId }).select('_id storeId')

      const route = await Route.findOneAndUpdate(
        { id: updatedOrder.routeId, 'listStore.storeInfo': storeData._id },
        {
          $set: {
            'listStore.$.status': '1',
            'listStore.$.statusText': 'เยี่ยมแล้ว',
            'listStore.$.date': new Date()
          }
        },
        { new: true }
      )


    }


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

exports.updateSendmoney = async (req, res) => {
  try {
    const { orderId, sendmoney } = req.body
    const channel = req.headers['x-channel']
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const order = await Order.findOne({ orderId })

    const updatedOrder = await Order.findOneAndUpdate(
      { orderId },
      { $set: { qr: sendmoney } },
      { new: true }
    )

    if (!order) {
      return res.status(404).json({ status: 404, message: 'Order not found!' })
    }

    res.status(200).json({
      status: 200,
      message: 'Updated qr successfully!',
      data: updatedOrder
    })
  } catch (error) {
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
  try {
    const { channel } = req.query
    let { startDate, endDate } = req.query
    const { area, team, zone } = req.query

    // console.log(channel, date)
    let statusArray = (req.query.status || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    if (statusArray.length === 0) {
      statusArray = ['pending'] // default
    }
    // ,'approved','completed'
    // console.log(statusArray)
    // if (!date || date === 'null') {
    //   const today = new Date()
    //   const year = today.getFullYear()
    //   const month = String(today.getMonth() + 1).padStart(2, '0') // เดือนเริ่มที่ 0
    //   const day = String(today.getDate()).padStart(2, '0')

    //   date = `${year}${month}${day}`
    //   // console.log('📅 date:', date)
    // }

    // const channel = 'cash';
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)

    // const modelOrder = await Order.find({
    //   orderId: { $not: /CC/ },
    // })

    // ช่วงเวลา "ไทย" ที่ผู้ใช้เลือก

    if (!/^\d{8}$/.test(startDate)) {
      const nowTH = new Date(
        new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
      )
      const y = nowTH.getFullYear()
      const m = String(nowTH.getMonth() + 1).padStart(2, '0')
      const d = String(nowTH.getDate()).padStart(2, '0') // ← ใช้ getDate() ไม่ใช่ getDay()
      startDate = `${y}${m}${d}` // YYYYMMDD
      endDate = `${y}${m}${d}` // YYYYMMDD
    }
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

    // console.log(startTH, endTH)

    let query = {
      createdAt: {
        $gte: startTH,
        $lte: endTH
      },
      status: { $nin: ['canceled', 'waitApprove'] },
      status: { $in: statusArray },
      type: { $in: ['sale', 'saleNoodle'] },
      'store.area': { $ne: 'IT211' },

    }

    // Order Change
    let queryChange = {
      createdAt: {
        $gte: startTH,
        $lte: endTH
      },
      'store.area': { $ne: 'IT211' },
      status: { $in: statusArray },
      status: { $nin: ['canceled', 'pending', 'reject'] },
      type: { $in: ['change'] }
    }

    let queryRefund = {
      status: { $in: statusArray },
      status: { $nin: ['canceled', 'reject', 'pending'] },
      'store.area': { $ne: 'IT211' },
      createdAt: {
        $gte: startTH,
        $lte: endTH
      }
    }

    if (area) {
      query['store.area'] = area
      queryChange['store.area'] = area
      queryRefund['store.area'] = area
    } else if (zone) {
      query['store.area'] = { $regex: `^${zone}`, $options: 'i' }
      queryChange['store.area'] = { $regex: `^${zone}`, $options: 'i' }
      queryRefund['store.area'] = { $regex: `^${zone}`, $options: 'i' }
    }

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
    //   $project: {
    //     // ดึงเฉพาะที่ต้องใช้
    //     createdAt: 1,
    //     orderId: 1,
    //     sale: 1,
    //     store: 1,
    //     // team3: 1,
    //     listProduct: 1,
    //     listPromotions: 1
    //   }
    // })

    // console.log(pipeline[3])

    pipeline.push({
      $sort: { statusASC: 1, createdAt: -1 }
    })


    if (area.startsWith('FT')) {
      pipeline[0].$match.status.$in.push('success')
    }

    const modelOrder = await Order.aggregate(pipeline)
    // console.log(modelOrder)

    const pipelineChange = [
      {
        $match: queryChange
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
              { $substrCP: ['$store.area', 0, 2] }, // "BE"
              { $substrCP: ['$store.area', 3, 1] } // "1" → from "212" (character at index 3)
            ]
          }
        }
      },
      {
        $sort: { createdAt: 1, orderId: 1 } // เรียงจากน้อยไปมาก (ASC) ถ้าอยากให้ใหม่สุดอยู่บน ใช้ -1
      }
    ]

    if (team) {
      pipelineChange.push({
        $match: {
          team3: { $regex: `^${team}`, $options: 'i' }
        }
      })
    }

    pipelineChange.push({
      $sort: { statusASC: 1, createdAt: -1 }
    })

    const modelChange = await Order.aggregate(pipelineChange)

    const pipelineRefund = [
      {
        $match: queryRefund
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
      pipelineRefund.push({
        $match: {
          team3: { $regex: `^${team}`, $options: 'i' }
        }
      })
    }

    pipelineRefund.push({
      $sort: { statusASC: 1, createdAt: -1 }
    })

    const modelRefund = await Refund.aggregate(pipelineRefund)

    const tranFromOrder = modelOrder.flatMap(order => {
      let counterOrder = 0
      function formatDateToThaiYYYYMMDD(date) {
        const d = new Date(date)
        d.setHours(d.getHours() + 7) // บวก 7 ชั่วโมงให้เป็นเวลาไทย (UTC+7)

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
        switch (channel) {
          case 'cash':
            CUNO = order.store.storeId
            OAORTP = 'A31'
            break
          case 'pc':
            CUNO = order.sale.salePayer
            OAORTP = 'A51'
            break

          default:
            break
        }

        return {
          // AREA: order.store.area,
          CUNO: CUNO,
          FACI: 'F10',
          WHLO: order.sale.warehouse,
          ORNO: '',
          OAORTP: OAORTP,
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
      function formatDateToThaiYYYYMMDD(date) {
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
          AREA: order.store.area,
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
    // console.log(refundItems)
    const uniqueCodes = [...new Set(refundItems)]

    // ปีที่ยอมรับ
    const currentYear = new Date().getFullYear()
    const years = [
      currentYear,
      currentYear - 1,
      currentYear - 2,
      currentYear + 1
    ]

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
            AREA: order.store.area,
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
    function yyyymmddToDdMmYyyy(dateString) {
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
    xlsx.utils.book_append_sheet(
      wb,
      ws,
      `ESP${yyyymmddToDdMmYyyy(startDate)}_${yyyymmddToDdMmYyyy(endDate)}`
    )

    const tempPath = path.join(
      os.tmpdir(),
      `CA_${yyyymmddToDdMmYyyy(startDate)}_${yyyymmddToDdMmYyyy(endDate)}.xlsx`
    )
    xlsx.writeFile(wb, tempPath)

    res.download(
      tempPath,
      `CA_${yyyymmddToDdMmYyyy(startDate)}_${yyyymmddToDdMmYyyy(endDate)}.xlsx`,
      err => {
        if (err) {
          console.error('❌ Download error:', err)
          // อย่าพยายามส่ง response ซ้ำถ้า header ถูกส่งแล้ว
          if (!res.headersSent) {
            res.status(500).send('Download failed')
          }
        }

        // ✅ ลบไฟล์ทิ้งหลังจากส่งเสร็จ (หรือส่งไม่สำเร็จ)
        fs.unlink(tempPath, () => { })
      }
    )

    // res.status(200).json({
    //   status:200,
    //   OBSAPR:sum(OBSAPR)
    // })
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }
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
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)

    const buildPipeline = type => {
      const match = {
        'store.area': area,
        status: { $nin: ['canceled', 'reject'] }
      }
      if (type) match.type = type // ใส่ type ถ้ากำหนด
      if (storeId) match['store.storeId'] = storeId

      return [
        { $match: match },

        { $unwind: { path: '$listStore', preserveNullAndEmptyArrays: true } },
        {
          $unwind: {
            path: '$listStore.listOrder',
            preserveNullAndEmptyArrays: true
          }
        },

        // ดึงส่วนประกอบวันที่ตามโซนเวลาไทยในทีเดียว
        {
          $addFields: {
            parts: {
              $dateToParts: { date: '$createdAt', timezone: 'Asia/Bangkok' }
            }
          }
        },

        // กรองปี ถ้ามี
        ...(year ? [{ $match: { 'parts.year': parseInt(year, 10) } }] : []),

        // รวมยอดตามเดือน
        { $group: { _id: '$parts.month', totalAmount: { $sum: '$total' } } },
        { $project: { _id: 0, month: '$_id', totalAmount: 1 } },
        { $sort: { month: 1 } }
      ]
    }

    // เรียกใช้งาน (ตัวอย่าง: แยกตามชนิด)
    const modelSale = await Order.aggregate(buildPipeline('sale'))
    const modelChange = await Order.aggregate(buildPipeline('change'))
    const modelRefund = await Refund.aggregate(buildPipeline('refund'))

    const merged = [
      ...modelSale.map(i => ({ ...i, totalAmount: i.totalAmount })), // บวก
      ...modelChange.map(i => ({ ...i, totalAmount: i.totalAmount })), // บวก
      ...modelRefund.map(i => ({ ...i, totalAmount: -i.totalAmount })) // ลบ
    ]

    const modelOrderValue = Object.values(
      merged.reduce((acc, item) => {
        if (!acc[item.month]) {
          acc[item.month] = { month: item.month, summary: 0 }
        }
        acc[item.month].summary += item.totalAmount
        return acc
      }, {})
    )

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

    let zoneList = []
    let dataOrder = []
    let dataChange = []
    let dataRefund = []

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
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { User } = getModelsByChannel(channel, res, userModel)
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
      // { $match: { period } },
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
    let otherModelRoute = await Route.aggregate([
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

    let modelRoute = [...modelRouteValue, ...otherModelRoute]

    // const areaList = [...new Set(modelRoute.map(item => item.area))].filter(area => area !== undefined).sort();

    let areaList = [
      ...new Set(
        modelRoute
          .map(item => item.area)
          .filter(
            areaItem => areaItem && (zone ? areaItem.startsWith(zone) : true)
          )
      )
    ].sort()

    let data = []

    if (type === 'route') {
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
    } else if (type === 'year') {
      // console.log('test')

      const users = await User.find({
        role: 'sale',
        area: { $ne: 'IT211' }
      }).select('area zone')
      if (!zone && !area) {
        zoneList = [...new Set(users.map(u => u.zone))]
        dataOrder = await getOrders(zoneList, res, channel, 'zone')
        dataChange = await getChange(zoneList, res, channel, 'zone')
        dataRefund = await getRefund(zoneList, res, channel, 'zone')

        // console.log(zoneList)
      } else {
        areaList = [...new Set(users.map(u => u.area))]
        dataOrder = await getOrders(areaList, res, channel, 'area')
        dataChange = await getChange(areaList, res, channel, 'area')
        dataRefund = await getRefund(areaList, res, channel, 'area')
      }

      dataOrder = dataOrder.map(item => ({
        ...item,
        createdAtThai: toThaiTime(item.createdAt)
      }))

      dataChange = dataChange.map(item => ({
        ...item,
        createdAtThai: toThaiTime(item.createdAt)
      }))

      dataRefund = dataRefund.map(item => ({
        ...item,
        createdAtThai: toThaiTime(item.createdAt)
      }))

      // console.log(dataRefund)

      function groupByMonthAndSum(data) {
        return data.reduce((acc, item) => {
          // ดึงเดือนจาก createdAtThai (หรือใช้ createdAt ก็ได้ถ้าเป็น Date)
          const date = new Date(item.createdAt)
          const monthKey = `${date.getFullYear()}-${String(
            date.getMonth() + 1
          ).padStart(2, '0')}`

          // ถ้ายังไม่มีเดือนนี้ ให้ set ค่าเริ่มต้น
          if (!acc[monthKey]) {
            acc[monthKey] = 0
          }

          // บวกค่า total เข้าไป
          acc[monthKey] += item.total || 0
          return acc
        }, {})
      }

      data = []

      if (!zone && !area) {
        for (const zone of zoneList) {
          const dataOrderArea = dataOrder.filter(
            item => item.store.zone === zone
          )
          const dataChangeArea = dataChange.filter(
            item => item.store.zone === zone
          )
          const dataRefundArea = dataRefund.filter(
            item => item.store.zone === zone
          )

          const orderByMonth = groupByMonthAndSum(dataOrderArea)
          const changeByMonth = groupByMonthAndSum(dataChangeArea)
          const refundByMonth = groupByMonthAndSum(dataRefundArea)

          // ✅ array 12 เดือน (index 0 = Jan, index 11 = Dec)
          const monthlySummary = Array(12).fill(0)

          for (let m = 1; m <= 12; m++) {
            const monthKey = `${new Date().getFullYear()}-${String(m).padStart(
              2,
              '0'
            )}`
            const order = orderByMonth[monthKey] || 0
            const change = changeByMonth[monthKey] || 0
            const refund = refundByMonth[monthKey] || 0
            monthlySummary[m - 1] = to2(order + change - refund)
          }

          data.push({
            zone,
            summary: monthlySummary
          })
        }
      } else {
        for (const area of areaList) {
          const dataOrderArea = dataOrder.filter(
            item => item.store.area === area
          )
          const dataChangeArea = dataChange.filter(
            item => item.store.area === area
          )
          const dataRefundArea = dataRefund.filter(
            item => item.store.area === area
          )

          const orderByMonth = groupByMonthAndSum(dataOrderArea)
          const changeByMonth = groupByMonthAndSum(dataChangeArea)
          const refundByMonth = groupByMonthAndSum(dataRefundArea)

          // ✅ array 12 เดือน (index 0 = Jan, index 11 = Dec)
          const monthlySummary = Array(12).fill(0)

          for (let m = 1; m <= 12; m++) {
            const monthKey = `${new Date().getFullYear()}-${String(m).padStart(
              2,
              '0'
            )}`
            const order = orderByMonth[monthKey] || 0
            const change = changeByMonth[monthKey] || 0
            const refund = refundByMonth[monthKey] || 0
            monthlySummary[m - 1] = to2(order + change - refund)
          }

          data.push({
            area,
            summary: monthlySummary
          })
        }
      }

      dataOrder = null
      dataChange = null
      dataRefund = null

      // if (global.gc) global.gc()

      return res.status(200).json({
        status: 200,
        message: 'Sucess',
        data: data
      })
    }

    // const io = getSocket()
    // io.emit('order/getSummarybyArea', {});

    res.status(200).json({
      status: 200,
      message: 'Success',
      data: data
    })

    dataOrder = null
    if (global.gc) global.gc()
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

exports.updateCompletedOrder = async (req, res) => {
  try {
    const { Order } = getModelsByChannel(channel, null, orderModel)
    const { Refund } = getModelsByChannel(channel, null, refundModel)

    // 1) ดึงยอดจากตาราง Sale (SQL)
    const sales = await OOHEAD.findAll({
      attributes: [
        'OACUOR',
        'OAORNO',
        'OAORST',
        'OAORSL',
        [(sequelize.fn('COUNT', sequelize.col('*')), 'count')]
      ],
      group: ['OACUOR'],
      // where: {
      //   OACUOR: '6808133120225'
      // },
      raw: true // จะได้ object ปกติ เช่น { OACUOR: '6808134360150', count: '3' }
    })

    // 2) ทำ map เพื่ออ้างอิงข้อมูลรายรายการ
    const saleById = new Map(
      sales.map(r => [
        String(r.OACUOR),
        {
          count: Number(r.count),
          lowStatus: String(r.OAORSL),
          heightStatus: String(r.OAORST),
          orderNo: String(r.OAORNO)
        }
      ])
    )

    // 2. Get pending orderIds ใน MongoDB
    // const inMongo = await Order.find({ status: 'pending' }).select('orderId')
    const inMongo = await Order.find().select('orderId')
    const inMongoRefund = await Refund.find({ status: 'pending' }).select(
      'orderId'
    )

    const orderIdsInMongo = inMongo.map(item => item.orderId.toString())
    const refundIdsInMongo = inMongoRefund.map(item => item.orderId.toString())

    // 3. filter ให้เหลือเฉพาะที่อยู่ทั้งสองฝั่ง
    // const matchedIds = orderIdsInMongo.filter(id => saleIds.includes(id))
    // const matchedIdsRefund = inMongoRefund.filter(id => saleIds.includes(id))
    const matchedIds = orderIdsInMongo.filter(id => saleIdSet.has(id))

    // 4. อัปเดตทุกตัวที่ match (วนทีละตัว)
    let updatedCount = 0
    let updatedCountReufund = 0

    // 4) อัปเดต Mongo ทีเดียวด้วย bulkWrite (ใส่ OACUOR และข้อมูลจาก Sale)
    if (matchedIds.length) {
      const ops = matchedIds.map(orderId => ({
        updateOne: {
          filter: { orderId },
          update: {
            $set: {
              status: 'completed',
              statusTH: 'สำเร็จ',
              updatedAt: new Date(),
              // เก็บ OACUOR ไว้ในเอกสารด้วย (ถ้าต้องการ)
              oacuor: orderId,
              // ใส่ข้อมูลประกอบจากฝั่ง Sale (เช่นจำนวนแถวที่เจอ)
              lowStatus: saleById.get(orderId)?.lowStatus ?? '',
              heightStatus: saleById.get(orderId)?.heightStatus ?? '',
              orderNo: saleById.get(orderId)?.orderNo ?? ''
            }
          }
        }
      }))

      const res = await Order.bulkWrite(ops, { ordered: false })
      console.log('Order updated:', res.modifiedCount)
    }

    // 4) อัปเดต Mongo ทีเดียวด้วย bulkWrite (ใส่ OACUOR และข้อมูลจาก Sale)

    for (const orderId of matchedIdsRefund) {
      try {
        const result = await Refund.updateOne(
          { orderId },
          {
            $set: {
              status: 'completed',
              statusTH: 'สำเร็จ',
              updatedAt: new Date()
            }
          }
        )
        if (result.modifiedCount > 0) updatedCountReufund++
      } catch (err) {
        console.error(`Error update Refund orderId: ${orderId}`, err)
      }
    }

    const summaryCount = updatedCount + updatedCountReufund

    const io = getSocket()
    io.emit('order/statusOrderUpdated', {
      summaryCount,
      updatedAt: new Date()
    })

    // });

    console.log(`Total updated Order: ${summaryCount}`)

    res.status(200).json({
      status: 200,
      message: 'Successful',
      summaryCount: summaryCount
    })
  } catch (error) {
    res.status(500).json({ status: 500, message: error.message })
  }
}

exports.erpApiCheckOrder = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)

    // 2. Get pending orderIds ใน MongoDB
    const inMongo = await Order.find({ status: 'pending' }).select('orderId')
    const inMongoRefund = await Refund.find({ status: 'approved' }).select(
      'orderId'
    )
    // const inMongoRefund = await Refund.find({ status: 'pending' }).select(
    //   'orderId'
    // )

    const orderIdsInMongo = inMongo.map(item => item.orderId.toString())
    const refundIdsInMongo = inMongoRefund.map(item => item.orderId.toString())
    // const refundIdsInMongo = inMongoRefund.map(item => item.orderId.toString())

    // 2) กันลิมิต MSSQL ด้วยการ chunk (เช่น ชุดละ 1000)
    const chunk = (arr, size) => {
      const out = []
      for (let i = 0; i < arr.length; i += size)
        out.push(arr.slice(i, i + size))
      return out
    }
    const idChunks = chunk(orderIdsInMongo, 1000)
    const idChunksRefund = chunk(refundIdsInMongo, 1000)

    // const matchedIdsRefund = inMongoRefund.filter(id => saleIds.includes(id))
    let sales = []
    let refund = []

    for (const ids of idChunks) {
      // 1) ดึงยอดจากตาราง Sale (SQL)
      const rows = await OOHEAD.findAll({
        attributes: [
          'OACUOR',
          [sequelize.fn('MAX', sequelize.col('OAORNO')), 'OAORNO'],
          [sequelize.fn('MAX', sequelize.col('OAORST')), 'OAORST'],
          [sequelize.fn('MAX', sequelize.col('OAORSL')), 'OAORSL']
        ],
        where: { OACUOR: { [Op.in]: ids } }, // ✅ เฉพาะที่มีใน Mongo
        // where: { OACUOR: '6808133120225' }, // หรือ { OACUOR: { [Op.in]: ids } }
        group: ['OACUOR'],
        raw: true
      })
      sales = sales.concat(rows)
    }

    for (const ids of idChunksRefund) {
      // 1) ดึงยอดจากตาราง Sale (SQL)
      const rows = await OOHEAD.findAll({
        attributes: [
          'OACUOR',
          [sequelize.fn('MAX', sequelize.col('OAORNO')), 'OAORNO'],
          [sequelize.fn('MAX', sequelize.col('OAORST')), 'OAORST'],
          [sequelize.fn('MAX', sequelize.col('OAORSL')), 'OAORSL']
        ],
        where: { OACUOR: { [Op.in]: ids } }, // ✅ เฉพาะที่มีใน Mongo
        // where: { OACUOR: '6808133120225' }, // หรือ { OACUOR: { [Op.in]: ids } }
        group: ['OACUOR'],
        raw: true
      })
      refund = refund.concat(rows)
    }

    // 2) ทำ map เพื่ออ้างอิงข้อมูลรายรายการ
    const saleById = new Map(
      sales.map(r => [
        String(r.OACUOR),
        {
          lowStatus: String(r.OAORSL),
          heightStatus: String(r.OAORST),
          orderNo: String(r.OAORNO)
        }
      ])
    )

    const refundById = new Map(
      refund.map(r => [
        String(r.OACUOR),
        {
          lowStatus: String(r.OAORSL),
          heightStatus: String(r.OAORST),
          orderNo: String(r.OAORNO)
        }
      ])
    )
    const saleIdSet = new Set(sales.map(s => String(s.OACUOR)))
    const refundIdSet = new Set(refund.map(s => String(s.OACUOR)))
    // 3. filter ให้เหลือเฉพาะที่อยู่ทั้งสองฝั่ง
    const matchedIds = orderIdsInMongo.filter(id => saleIdSet.has(id))
    const refundMatchedIds = refundIdsInMongo.filter(id => refundIdSet.has(id))

    const oaornoList = sales.map(r => r.OACUOR).filter(Boolean)
    const refundList = refund.map(r => r.OACUOR).filter(Boolean)

    const lineAgg = await OOLINE.findAll({
      attributes: ['OBCUOR', [fn('COUNT', literal('*')), 'lineCount']],
      where: { OBCUOR: { [Op.in]: oaornoList } },
      group: ['OBCUOR'],
      raw: true
    })

    const refundLineAgg = await OOLINE.findAll({
      attributes: ['OBCUOR', [fn('COUNT', literal('*')), 'lineCount']],
      where: { OBCUOR: { [Op.in]: refundList } },
      group: ['OBCUOR'],
      raw: true
    })

    // console.log(lineAgg)

    const lineCountByOBORNO = new Map(
      lineAgg.map(r => [String(r.OBCUOR), Number(r.lineCount) || 0])
    )

    const lineCountByOBORNORefund = new Map(
      refundLineAgg.map(r => [String(r.OBCUOR), Number(r.lineCount) || 0])
    )

    // console.log(lineCountByOBORNO)

    // 4) แปลงเป็น OACUOR -> lineCount (อาศัย OAORNO ของ sales)
    const lineCountByOACUOR = new Map(
      sales.map(r => [
        String(r.OACUOR),
        lineCountByOBORNO.get(String(r.OACUOR)) ?? 0
      ])
    )

    const lineCountByOACUORRefund = new Map(
      sales.map(r => [
        String(r.OACUOR),
        lineCountByOBORNORefund.get(String(r.OACUOR)) ?? 0
      ])
    )

    // console.log(lineCountByOACUOR)

    // 4. อัปเดตทุกตัวที่ match (วนทีละตัว)
    let updatedCount = 0
    let updatedCountReufund = 0

    if (matchedIds.length) {
      const ops = matchedIds.map(orderId => ({
        updateOne: {
          filter: { orderId },
          update: {
            $set: {
              status: 'completed',
              statusTH: 'สำเร็จ',
              updatedAt: new Date(),
              // เก็บ OACUOR ไว้ในเอกสารด้วย (ถ้าต้องการ)
              // oacuor: orderId,
              // ใส่ข้อมูลประกอบจากฝั่ง Sale (เช่นจำนวนแถวที่เจอ)
              lowStatus: saleById.get(orderId)?.lowStatus ?? '',
              heightStatus: saleById.get(orderId)?.heightStatus ?? '',
              orderNo: saleById.get(orderId)?.orderNo ?? '',

              // ✅ จำนวนบรรทัดจาก OOLINE
              lineM3: lineCountByOACUOR.get(orderId) ?? 0
            }
          }
        }
      }))

      const res = await Order.bulkWrite(ops, { ordered: false })
      if (res.modifiedCount > 0) updatedCount++
      console.log('Order updated:', res.modifiedCount)
    }

    if (refundMatchedIds.length) {
      const ops = refundMatchedIds.map(orderId => ({
        updateOne: {
          filter: { orderId },
          update: {
            $set: {
              status: 'completed',
              statusTH: 'สำเร็จ',
              updatedAt: new Date(),
              // เก็บ OACUOR ไว้ในเอกสารด้วย (ถ้าต้องการ)
              // oacuor: orderId,
              // ใส่ข้อมูลประกอบจากฝั่ง Sale (เช่นจำนวนแถวที่เจอ)
              lowStatus: refundById.get(orderId)?.lowStatus ?? '',
              heightStatus: refundById.get(orderId)?.heightStatus ?? '',
              orderNo: refundById.get(orderId)?.orderNo ?? '',

              // ✅ จำนวนบรรทัดจาก OOLINE
              lineM3: lineCountByOACUORRefund.get(orderId) ?? 0
            }
          }
        }
      }))
      const res = await Refund.bulkWrite(ops, { ordered: false })
      if (res.modifiedCount > 0) updatedCountReufund++
      console.log('Refund updated:', res.modifiedCount)
    }
    const summaryCount = updatedCount + updatedCountReufund

    const io = getSocket()
    io.emit('order/statusOrderUpdated', {
      summaryCount,
      updatedAt: new Date()
    })

    // });

    res.status(200).json({
      status: 200,
      message: 'Successful',
      summaryCount: summaryCount
    })
  } catch (error) {
    res.status(500).json({ status: 500, message: error.message })
  }
}

exports.erpApiCheckOrderDistrabution = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { Distribution } = getModelsByChannel(channel, res, distributionModel)
    const { Product } = getModelsByChannel(channel, res, productModel)
    const year = 2025 // หรือใช้ new Date().getFullYear() ถ้าอยากให้ dynamic
    const month = 9 // กันยายน (เดือน 9)

    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)) // 1 ก.ย. 00:00 UTC
    const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0)) // 1 ต.ค. 00:00 UTC

    const inMongo = await Distribution.find({
      newTrip: 'true',
      // orderId: 'W681042101',
      status: {
        $nin: ['canceled', 'rejected']
      },
      createdAt: {
        $gte: startDate,
        $lt: endDate
      }
    }).select('_id orderId listProduct') // ✅ include listProduct directly

    const chunk = (arr, size) => {
      const out = []
      for (let i = 0; i < arr.length; i += size)
        out.push(arr.slice(i, i + size))
      return out
    }

    const orderIdsInMongo = inMongo.map(item => item.orderId.toString())
    const idChunks = chunk(orderIdsInMongo, 1000)

    for (const ids of idChunks) {
      // ✅ Fetch all matching DistributionM3 rows for the current batch
      const rows = await DisributionM3.findAll({
        where: { coNo: { [Op.in]: ids } },
        raw: true
      })

      for (const distributionTran of inMongo.filter(d =>
        ids.includes(d.orderId)
      )) {
        const orderId = distributionTran.orderId
        const row = rows.find(r => r.coNo === orderId)
        if (!row) {
          console.warn(`⚠️ Order ${orderId} not found in M3`)
          continue
        }

        // ✅ ตรวจสอบสถานะสินค้ารับใน M3
        const checkStatus = await MGLINE.findAll({
          where: {
            MRCONO: 410,
            MRTRNR: orderId,
            MRTRSH: '99'
          },
          raw: true
        })

        const productIds = checkStatus.map(item => item.MRITNO)

        // ✅ ดึงข้อมูลรับสินค้าจากระบบ ERP
        const Receive = await MHDISL.findAll({
          where: {
            coNo: orderId,
            productId: { [Op.in]: productIds }
          },
          raw: true
        })

        const ReceiveQty = Object.values(
          Receive.reduce((acc, cur) => {
            const key = `${cur.coNo}_${cur.withdrawUnit
              }_${cur.productId.trim()}`
            if (!acc[key]) {
              acc[key] = { ...cur }
            } else {
              acc[key].qtyPcs += cur.qtyPcs
              acc[key].weightGross += cur.weightGross
              acc[key].weightNet += cur.weightNet
            }
            return acc
          }, {})
        )

        let receivetotalQty = 0
        let receivetotal = 0

        for (const i of distributionTran.listProduct) {
          const productIdTrimmed = String(i.id || '').trim()
          const match = ReceiveQty.find(
            r => String(r.productId || '').trim() === productIdTrimmed
          )

          const listProductId = distributionTran.listProduct
            .map(i => i.id)
            .filter(Boolean)

          const productDetail = await Product.find({
            id: { $in: listProductId }
          })

          if (match) {
            const product = productDetail.find(
              u => String(u.id || '').trim() === productIdTrimmed
            )
            i.receiveUnit = match.withdrawUnit || ''

            if (!product || !Array.isArray(product.listUnit)) {
              i.receiveQty = 0
              continue
            }

            const unitFactor = product.listUnit.find(
              u =>
                String(u.unit || '').trim() ===
                String(match.withdrawUnit || '').trim()
            )

            if (!unitFactor?.factor) {
              i.receiveQty = 0
              continue
            }

            const qty = match.qtyPcs / unitFactor.factor
            receivetotalQty += qty
            receivetotal += qty * (unitFactor?.price?.sale || 0)
            i.receiveQty = qty
          } else {
            i.receiveUnit = ''
            i.receiveQty = 0
          }
        }

        // ✅ Update Distribution back to Mongo

        await Distribution.updateOne(
          { _id: distributionTran._id },
          {
            $set: {
              listProduct: distributionTran.listProduct,
              status: 'confirm',
              statusTH: 'ยืนยันรับของ'
            }
          }
        )
      }
    }

    res.status(200).json({
      status: 200,
      message: 'Successful'
    })
  } catch (error) {
    console.error('[erpApiCheckOrderDistrabution]', error)
    res.status(500).json({ status: 500, message: error.message })
  }
}

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
      status: { $nin: ['canceled', 'reject'] },
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
      { $match: { status: { $nin: ['pending'] } } },
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
      { $match: { status: { $nin: ['pending'] } } },
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
  try {
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
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }
}

exports.getGroup = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }
}

exports.getSummaryProduct = async (req, res) => {
  try {
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
        $unwind: {
          path: '$order.listProduct',
          preserveNullAndEmptyArrays: true
        }
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
        productFactor.find(
          i => i.productId === u.productId && i.unit == 'CTN'
        ) || {}
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
        ? (((storeCount?.count || 0) / allStoreCount.constStore) * 100).toFixed(
          2
        )
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
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }
}

exports.getProductLimit = async (req, res) => {
  try {
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
      const productLimitDetail = await PromotionLimit.findOne({
        proId: i.proId
      })
      productLimitList.push(productLimitDetail)
    }

    res.status(200).json({
      status: 200,
      message: productLimitList
    })
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }
}

exports.summaryAllProduct = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }
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
          status: { $nin: ['pending', 'canceled', 'reject'] }
        }),
        Order.find({
          'store.area': area,
          period: periodStr,
          createdAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
          type: { $in: ['sale', 'saleNoodle'] },
          status: { $nin: ['canceled', 'reject'] }
        }),
        Order.find({
          'store.area': area,
          period: periodStr,
          createdAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
          type: 'change',
          status: { $nin: ['pending', 'canceled', 'reject'] }
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
            status: { $nin: ['pending', 'canceled', 'reject'] }
          }),
          Order.find({
            'store.area': area,
            period: periodStr,
            createdAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
            type: 'sale',
            status: { $nin: ['canceled', 'reject'] }
          }),
          Order.find({
            'store.area': area,
            period: periodStr,
            createdAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
            type: 'change',
            status: { $nin: ['pending', 'canceled', 'reject'] }
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
  try {
    const { area, type, date, role } = req.query
    const channel = req.headers['x-channel']
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)

    if (role == 'sale' || role == '' || !role) {
      if (!type) {
        return res.status(200).json({
          message: 'type is require'
        })
      }
      let filterCreatedAt = {}
      let filterArea = {}
      if (area) {
        filterArea = { 'store.area': area }
      }

      if (date) {
        const year = Number(date.substring(0, 4))
        const month = Number(date.substring(4, 6)) - 1
        const day = Number(date.substring(6, 8))
        // เวลาตาม timezone ไทย
        const startDateUTC = new Date(Date.UTC(year, month, day, 0, 0, 0)) // 2025-08-01T17:00:00Z
        const endDateUTC = new Date(Date.UTC(year, month, day + 1, 0, 0, 0) - 1) // 2025-08-02T16:59:59.999Z
        // เทียบโดย "เพิ่ม +7 ชั่วโมงที่ createdAt" ก่อน แล้วค่อยเทียบกับช่วงเวลาไทย
        filterCreatedAt = {
          $expr: {
            $and: [
              {
                $gte: [
                  {
                    $dateAdd: {
                      startDate: '$createdAt',
                      unit: 'hour',
                      amount: 7
                    }
                  },
                  startDateUTC
                ]
              },
              {
                $lt: [
                  {
                    $dateAdd: {
                      startDate: '$createdAt',
                      unit: 'hour',
                      amount: 7
                    }
                  },
                  endDateUTC
                ]
              }
            ]
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
        status: { $nin: ['pending', 'canceled', 'reject'] }
      })

      if (dataOrder.length === 0) {
        return res.status(404).json({
          status: 404,
          message: 'Not found Order'
        })
      }
      const order = ['sale', 'change', 'refund']

      if (type === 'sale') {
        data = [...dataOrder, ...dataRefund]
          .map(item => {
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
              paymentMethod: paymentMethodTH ? paymentMethodTH : item.reference
            }
          })
          .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
      } else if (type === 'refund') {
        data = [...dataRefund].map(item => {
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
      }
      // summary ตาม type
      const summary = data.reduce((acc, cur) => {
        if (!acc[cur.type]) {
          acc[cur.type] = { count: 0, total: 0 }
        }
        acc[cur.type].count += 1
        acc[cur.type].total += cur.total
        return acc
      }, {})

      // รวมทั้งหมด
      const grandTotal = data.reduce((sum, cur) => sum + cur.total, 0)

      res.status(200).json({
        status: 200,
        message: 'sucess',
        data: data,
        grandTotal: grandTotal,
        summary: summary
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
        status: 200
        // sendMoneyData
      })
    }
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }
}

exports.getSummary18SKU = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }
}

exports.reportCheckin = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }
}

exports.OrderZeroDiff = async (req, res) => {
  try {
    const { area, period } = req.body
    const channel = req.headers['x-channel']
    const { Store } = getModelsByChannel(channel, res, storeModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Stock } = getModelsByChannel(channel, res, stockModel)

    const stockData = await Stock.findOne({
      area: area,
      period: period,
      'listProduct.balancePcs': { $lt: 0 }
    })

    // console.log(stockData)

    const negProductIds = (stockData.listProduct ?? [])
      .filter(it => Number(it.balancePcs) < 0)
      .map(it => it.productId ?? it.id)
      .filter(Boolean)

    // console.log(negProductIds)

    const orderData = await Order.find({
      'store.area': area,
      period: period
    }).lean()

    // proDiff = orderData.map()

    // const orderDiff = []

    // for (i of negProductIds){
    //   const data = orderData.map(item => item.listProduct.find(u => u.id === i))

    //   console.log(data)

    // }

    res.status(200).json({
      status: 200,
      message: 'Sucess',
      data: negProductIds
    })
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }
}

exports.checkOrderCancelM3 = async (req, res) => {
  try {
    const { period } = req.body
    const channel = req.headers['x-channel']
    const { Store } = getModelsByChannel(channel, res, storeModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Stock } = getModelsByChannel(channel, res, stockModel)

    const orderCC = await Order.aggregate([
      {
        $match: {
          period,
          type: 'sale',
          status: 'canceled',
          'store.area': { $ne: 'IT211' }
        }
      },
      {
        $project: {
          _id: 0,
          status: 1, // << เพิ่ม
          orderId: {
            $cond: [
              { $eq: [{ $strLenCP: '$orderId' }, 16] },
              {
                $substrCP: [
                  '$orderId',
                  0,
                  { $subtract: [{ $strLenCP: '$orderId' }, 3] }
                ]
              },
              '$orderId'
            ]
          }
        }
      }
    ])

    const refundCC = await Refund.aggregate([
      {
        $match: {
          period,
          type: 'refund',
          status: { $in: ['canceled', 'reject'] },
          'store.area': { $ne: 'IT211' }
        }
      },
      { $project: { _id: 0, orderId: 1, reference: 1, status: 1 } } // << ส่ง status ด้วย
    ])

    const refundIdCCs = refundCC.map(x => String(x.orderId).trim())
    const changeIdCCS = refundCC.map(x => String(x.reference).trim())
    const orderIdCCs = orderCC.map(x => String(x.orderId).trim())

    const saleSet = new Set(orderIdCCs)
    const refundSet = new Set(refundIdCCs)
    const changeSet = new Set(changeIdCCS)

    // map: id -> status (จาก Mongo)
    const saleStatusMap = new Map(
      orderCC.map(x => [String(x.orderId).trim(), x.status || ''])
    )
    const refundStatusMap = new Map(
      refundCC.map(x => [String(x.orderId).trim(), x.status || ''])
    )
    // ถ้ามี collection ของ change เอง ค่อยเติม changeStatusMap ภายหลัง
    const changeStatusMap = new Map()

    const allCC = [...new Set([...refundIdCCs, ...orderIdCCs, ...changeIdCCS])]

    const orderM3 = await OOHEAD.findAll({
      where: { OACUOR: { [Op.in]: allCC } },
      attributes: { exclude: ['id'] },
      raw: true
    })

    const data = (orderM3 ?? []).map(item => {
      const id = String(item.OACUOR).trim()

      const type = saleSet.has(id)
        ? 'Sale'
        : refundSet.has(id)
          ? 'Refund'
          : changeSet.has(id)
            ? 'Change'
            : ''

      const typeId =
        type === 'Sale'
          ? 'A31'
          : type === 'Refund'
            ? 'A34'
            : type === 'Change'
              ? 'B31'
              : ''

      const statusTablet =
        type === 'Sale'
          ? saleStatusMap.get(id) ?? ''
          : type === 'Refund'
            ? refundStatusMap.get(id) ?? ''
            : type === 'Change'
              ? changeStatusMap.get(id) ?? ''
              : ''

      return { orderId: id, type, typeId, statusTablet }
    })

    const wb = xlsx.utils.book_new()
    const ws = xlsx.utils.json_to_sheet(data)
    xlsx.utils.book_append_sheet(wb, ws, `orderM3CC${period}`)

    const tempPath = path.join(os.tmpdir(), `orderM3CC${period}.xlsx`)
    xlsx.writeFile(wb, tempPath)

    res.download(tempPath, `orderM3CC${period}.xlsx`, err => {
      if (err) {
        console.error('❌ Download error:', err)
        // อย่าพยายามส่ง response ซ้ำถ้า header ถูกส่งแล้ว
        if (!res.headersSent) {
          res.status(500).send('Download failed')
        }
      }

      // ✅ ลบไฟล์ทิ้งหลังจากส่งเสร็จ (หรือส่งไม่สำเร็จ)
      fs.unlink(tempPath, () => { })
    })

    // res.status(200).json({
    //   status: 200,
    //   message: 'Sucess',
    //   data: data
    // })
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }
}

exports.getTarget = async (req, res) => {
  try {
    const { area } = req.query
    let { startDate, endDate } = req.query
    const channel = req.headers['x-channel']
    const { Store } = getModelsByChannel(channel, res, storeModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Stock, AdjustStock } = getModelsByChannel(channel, res, stockModel)
    const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)
    const { Giveaway } = getModelsByChannel(channel, res, giveModel)
    const { Target } = getModelsByChannel(channel, res, targetModel)

    const { Distribution, WereHouse } = getModelsByChannel(
      channel,
      res,
      distributionModel
    )
    const product = await Product.find()

    if (!/^\d{8}$/.test(startDate)) {
      const nowTH = new Date(
        new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
      )
      const y = nowTH.getFullYear()
      const m = String(nowTH.getMonth() + 1).padStart(2, '0')
      const d = String(nowTH.getDate()).padStart(2, '0') // ← ใช้ getDate() ไม่ใช่ getDay()
      startDate = `${y}${m}${d}` // YYYYMMDD
      endDate = `${y}${m}${d}` // YYYYMMDD
    }

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

    const period = `${startDate.slice(0, 4)}${startDate.slice(4, 6)}`

    const [
      dataSendmoney,
      dataRefund,
      dataOrderSale,
      dataOrderChange,
      dataGive,
      datawithdraw,
      dataAdjustStock,
      dataTarget
    ] = await Promise.all([
      // SendMoney.find({
      //   area: area,
      //   dateAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
      // }),
      SendMoney.aggregate([
        {
          $match: {
            area: area,
            dateAt: { $gte: startTH, $lte: endTH }
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
        createdAt: { $gte: startTH, $lte: endTH },
        type: 'refund',
        status: { $nin: ['pending', 'canceled', 'reject'] }
      }),

      Order.find({
        'store.area': area,
        createdAt: { $gte: startTH, $lte: endTH },
        type: 'sale',
        status: { $nin: ['canceled', 'reject'] }
      }),
      Order.find({
        'store.area': area,
        createdAt: { $gte: startTH, $lte: endTH },
        type: 'change',
        status: { $nin: ['pending', 'canceled', 'reject'] }
      }),
      Giveaway.find({
        'store.area': area,
        createdAt: { $gte: startTH, $lte: endTH },
        type: 'give',
        status: { $nin: ['canceled', 'reject'] }
      }),
      Distribution.find({
        area: area,
        createdAt: { $gte: startTH, $lte: endTH },
        type: 'withdraw',
        status: { $nin: ['pending', 'canceled', 'reject'] }
      }),
      AdjustStock.find({
        area: area,
        createdAt: { $gte: startTH, $lte: endTH },
        type: 'adjuststock',
        status: { $nin: ['pending', 'canceled', 'reject'] }
      }),
      Target.findOne({
        TG_AREA: area,
        TG_PERIOD: period
        // createdAt: { $gte:startTH, $lte: endTH },
      })
    ])


    const totalSendmoney = (dataSendmoney ?? []).reduce(
      (sum, item) => sum + (Number(item?.sendmoney) || 0),
      0
    )

    const salePcs = Object.values(
      (dataOrderSale || [])
        .flatMap(order =>
          (order.listProduct || []).map(i => {
            const factor =
              product
                .find(u => u.id === i.id)
                ?.listUnit.find(u => u.unit === i.unit)?.factor ?? 1

            return {
              id: i.id,
              qtyPcs: (i.qty || 0) * factor,
              sale: i.netTotal || 0
            }
          })
        )
        .reduce((acc, cur) => {
          if (!acc[cur.id]) acc[cur.id] = { id: cur.id, qtyPcs: 0, sale: 0 }
          acc[cur.id].qtyPcs += cur.qtyPcs
          acc[cur.id].sale += cur.sale
          return acc
        }, {})
    )
    let sale = 0
    let saleQty = 0

    for (const item of salePcs) {
      const factorCtn =
        product
          .find(u => u.id === item.id)
          ?.listUnit.find(u => u.unit === 'CTN')?.factor ?? 1

      const saleCtn = Math.floor((item.qtyPcs || 0) / (factorCtn || 1))
      saleQty += saleCtn
      sale += item.sale
    }

    const goodPcs = Object.values(
      (dataRefund || [])
        .flatMap(o => o.listProduct || [])
        .filter(i => i.condition === 'good') // เลือกเฉพาะ good
        .map(i => {
          const meta = (product || []).find(u => String(u.id) === String(i.id))
          const factor =
            meta?.listUnit?.find(u => u.unit === i.unit)?.factor ?? 1
          return {
            id: i.id,
            qtyPcs: (Number(i.qty) || 0) * (Number(factor) || 1),
            sale: Number(i.total) || 0
          }
        })
        .reduce((acc, cur) => {
          acc[cur.id] ??= { id: cur.id, qtyPcs: 0, sale: 0 }
          acc[cur.id].qtyPcs += cur.qtyPcs
          acc[cur.id].sale += cur.sale
          return acc
        }, {})
    )

    let good = 0
    let goodQty = 0

    for (const item of goodPcs) {
      const factorCtn =
        product
          .find(u => u.id === item.id)
          ?.listUnit.find(u => u.unit === 'CTN')?.factor ?? 1

      const saleCtn = Math.floor((item.qtyPcs || 0) / (factorCtn || 1))
      goodQty += saleCtn
      good += item.sale
    }

    const damagedPcs = Object.values(
      (dataRefund || [])
        .flatMap(o => o.listProduct || [])
        .filter(i => i.condition === 'damaged') // เลือกเฉพาะ good
        .map(i => {
          const meta = (product || []).find(u => String(u.id) === String(i.id))
          const factor =
            meta?.listUnit?.find(u => u.unit === i.unit)?.factor ?? 1
          return {
            id: i.id,
            qtyPcs: (Number(i.qty) || 0) * (Number(factor) || 1),
            sale: Number(i.total) || 0
          }
        })
        .reduce((acc, cur) => {
          acc[cur.id] ??= { id: cur.id, qtyPcs: 0, sale: 0 }
          acc[cur.id].qtyPcs += cur.qtyPcs
          acc[cur.id].sale += cur.sale
          return acc
        }, {})
    )

    let damaged = 0
    let damagedQty = 0

    for (const item of damagedPcs) {
      const factorCtn =
        product
          .find(u => u.id === item.id)
          ?.listUnit.find(u => u.unit === 'CTN')?.factor ?? 1

      const saleCtn = Math.floor((item.qtyPcs || 0) / (factorCtn || 1))
      damagedQty += saleCtn
      damaged += item.sale
    }

    const refundPcs = Object.values(
      (dataRefund || [])
        .flatMap(o => o.listProduct || [])
        .map(i => {
          const meta = (product || []).find(u => String(u.id) === String(i.id))
          const factor =
            meta?.listUnit?.find(u => u.unit === i.unit)?.factor ?? 1
          return {
            id: i.id,
            qtyPcs: (Number(i.qty) || 0) * (Number(factor) || 1),
            sale: Number(i.total) || 0
          }
        })
        .reduce((acc, cur) => {
          acc[cur.id] ??= { id: cur.id, qtyPcs: 0, sale: 0 }
          acc[cur.id].qtyPcs += cur.qtyPcs
          acc[cur.id].sale += cur.sale
          return acc
        }, {})
    )

    let refund = 0
    let refundQty = 0

    for (const item of refundPcs) {
      const factorCtn =
        product
          .find(u => u.id === item.id)
          ?.listUnit.find(u => u.unit === 'CTN')?.factor ?? 1

      const saleCtn = Math.floor((item.qtyPcs || 0) / (factorCtn || 1))
      refundQty += saleCtn
      refund += item.sale
    }

    const changePcs = Object.values(
      (dataOrderChange || [])
        .flatMap(o => o.listProduct || [])
        .map(i => {
          const meta = (product || []).find(u => String(u.id) === String(i.id))
          const factor =
            meta?.listUnit?.find(u => u.unit === i.unit)?.factor ?? 1
          return {
            id: i.id,
            qtyPcs: (Number(i.qty) || 0) * (Number(factor) || 1),
            sale: Number(i.netTotal) || 0
          }
        })
        .reduce((acc, cur) => {
          acc[cur.id] ??= { id: cur.id, qtyPcs: 0, sale: 0 }
          acc[cur.id].qtyPcs += cur.qtyPcs
          acc[cur.id].sale += cur.sale
          return acc
        }, {})
    )

    let change = 0
    let changeQty = 0

    for (const item of changePcs) {
      const factorCtn =
        product
          .find(u => u.id === item.id)
          ?.listUnit.find(u => u.unit === 'CTN')?.factor ?? 1

      const saleCtn = Math.floor((item.qtyPcs || 0) / (factorCtn || 1))
      changeQty += saleCtn
      change += item.sale
    }

    const givePcs = Object.values(
      (dataGive || [])
        .flatMap(o => o.listProduct || [])
        .map(i => {
          const meta = (product || []).find(u => String(u.id) === String(i.id))
          const factor =
            meta?.listUnit?.find(u => u.unit === i.unit)?.factor ?? 1
          return {
            id: i.id,
            qtyPcs: (Number(i.qty) || 0) * (Number(factor) || 1),
            sale: Number(i.total) || 0
          }
        })
        .reduce((acc, cur) => {
          acc[cur.id] ??= { id: cur.id, qtyPcs: 0, sale: 0 }
          acc[cur.id].qtyPcs += cur.qtyPcs
          acc[cur.id].sale += cur.sale
          return acc
        }, {})
    )

    let give = 0
    let giveQty = 0

    for (const item of givePcs) {
      const factorCtn =
        product
          .find(u => u.id === item.id)
          ?.listUnit.find(u => u.unit === 'CTN')?.factor ?? 1

      const saleCtn = Math.floor((item.qtyPcs || 0) / (factorCtn || 1))
      giveQty += saleCtn
      give += item.sale
    }

    const withdrawPcs = Object.values(
      (datawithdraw || [])
        .flatMap(o => o.listProduct || [])
        .map(i => {
          const meta = (product || []).find(u => String(u.id) === String(i.id))
          const factor =
            meta?.listUnit?.find(u => u.unit === i.unit)?.factor ?? 1
          return {
            id: i.id,
            qtyPcs: (Number(i.qty) || 0) * (Number(factor) || 1),
            sale: Number(i.total) || 0
          }
        })
        .reduce((acc, cur) => {
          acc[cur.id] ??= { id: cur.id, qtyPcs: 0, sale: 0 }
          acc[cur.id].qtyPcs += cur.qtyPcs
          acc[cur.id].sale += cur.sale
          return acc
        }, {})
    )

    let withdraw = 0
    let withdrawQty = 0

    for (const item of withdrawPcs) {
      const factorCtn =
        product
          .find(u => u.id === item.id)
          ?.listUnit.find(u => u.unit === 'CTN')?.factor ?? 1

      const saleCtn = Math.floor((item.qtyPcs || 0) / (factorCtn || 1))
      withdrawQty += saleCtn
      withdraw += item.sale
    }

    const recievePcs = Object.values(
      (datawithdraw || [])
        .flatMap(o => o.listProduct || [])
        .map(i => {
          const meta = (product || []).find(u => String(u.id) === String(i.id))
          const factor =
            meta?.listUnit?.find(u => u.unit === 'CTN')?.factor ?? 1
          // const salePrice = meta?.listUnit?.find(u => u.unit ===  'BOT'||'PCS').price.sale
          // console.log(i.receiveQty)
          return {
            id: i.id,
            qtyPcs: (Number(i.receiveQty) || 0) * (Number(factor) || 1)
            // sale: Number(i.receiveQty) * salePrice || 0
          }
        })
        .reduce((acc, cur) => {
          acc[cur.id] ??= { id: cur.id, qtyPcs: 0, sale: 0 }
          acc[cur.id].qtyPcs += cur.qtyPcs
          // acc[cur.id].sale += cur.sale
          return acc
        }, {})
    )

    let recieve = 0
    let recieveQty = 0

    for (const item of recievePcs) {
      const factorCtn =
        product
          .find(u => u.id === item.id)
          ?.listUnit.find(u => u.unit === 'CTN')?.factor ?? 1

      const sale =
        product
          .find(u => u.id === item.id)
          ?.listUnit.find(u => u.unit === 'CTN')?.price.sale ?? 0

      const saleCtn = Math.floor((item.qtyPcs || 0) / (factorCtn || 1))

      const priceCtn = saleCtn * sale

      recieveQty += saleCtn
      recieve += priceCtn
    }

    const adjustPcs = Object.values(
      (dataAdjustStock || [])
        .flatMap(o => o.listProduct || [])
        .map(i => {
          const meta = (product || []).find(u => String(u.id) === String(i.id))
          const factor =
            meta?.listUnit?.find(u => u.unit === i.receiveUnit)?.factor ?? 1

          return {
            id: i.id,
            qtyPcs: (Number(i.qty) || 0) * (Number(factor) || 1),
            sale: Number(i.price) || 0
          }
        })
        .reduce((acc, cur) => {
          acc[cur.id] ??= { id: cur.id, qtyPcs: 0, sale: 0 }
          acc[cur.id].qtyPcs += cur.qtyPcs
          acc[cur.id].sale += cur.sale
          return acc
        }, {})
    )

    let adjustStock = 0
    let adjustStockQty = 0

    for (const item of adjustPcs) {
      const factorCtn =
        product
          .find(u => u.id === item.id)
          ?.listUnit.find(u => u.unit === 'CTN')?.factor ?? 1

      const saleCtn = Math.floor((item.qtyPcs || 0) / (factorCtn || 1))
      adjustStockQty += saleCtn
      adjustStock += item.sale
    }

    res.status(200).json({
      status: 200,
      message: 'Sucess',
      sale: to2(sale + (change - refund)),
      saleQty: saleQty,
      good: to2(good),
      goodQty: goodQty,
      damaged: to2(damaged),
      damagedQty: damagedQty,
      refund: to2(refund),
      refundQty: refundQty,
      change: to2(change),
      changeQty: changeQty,
      give: to2(give),
      giveQty: giveQty,
      withdraw: to2(withdraw),
      withdrawQty: withdrawQty,
      recieve: to2(recieve),
      recieveQty: recieveQty,
      adjustStock: to2(adjustStock),
      adjustStockQty: adjustStockQty,
      target: parseFloat(dataTarget?.TG_AMOUNT ?? 0),
      targetPercent:
        to2(
          (sale * 100) / parseFloat(dataTarget?.TG_AMOUNT * 1.07 ?? 0) ?? 0
        ) ?? 0
    })
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }
}

exports.orderPowerBI = async (req, res) => {
  try {
    let { startDate, endDate, excel, status } = req.query

    const now = new Date()
    const thailandOffset = 7 * 60 // นาที
    const utc = now.getTime() + now.getTimezoneOffset() * 60000
    const thailand = new Date(utc + thailandOffset * 60000)

    const year = thailand.getFullYear()
    const month = String(thailand.getMonth() + 1).padStart(2, '0')
    const day = String(thailand.getDate()).padStart(2, '0')
    const currentDate = `${year}${month}${day}`

    const channel = 'cash'
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { Store } = getModelsByChannel(channel, res, storeModel)

    const conoBi = await dataPowerBiQuery(channel)
    const conoBiList = conoBi.flatMap(item => item.CONO)
    // console.log(conoBiList)
    const allTransactions = await dataPowerBi(
      channel,
      conoBiList,
      status,
      startDate,
      endDate,
      currentDate
    )

    if (excel == 'true') {
      const wb = xlsx.utils.book_new()
      const ws = xlsx.utils.json_to_sheet(allTransactions)
      xlsx.utils.book_append_sheet(
        wb,
        ws,
        `powerBi${yyyymmddToDdMmYyyy(startDate)}_${yyyymmddToDdMmYyyy(endDate)}`
      )

      const tempPath = path.join(
        os.tmpdir(),
        `powerBi${yyyymmddToDdMmYyyy(startDate)}_${yyyymmddToDdMmYyyy(
          endDate
        )}.xlsx`
      )
      xlsx.writeFile(wb, tempPath)

      res.download(
        tempPath,
        `powerBi${yyyymmddToDdMmYyyy(startDate)}_${yyyymmddToDdMmYyyy(
          endDate
        )}.xlsx`,
        err => {
          if (err) {
            console.error('❌ Download error:', err)
            // อย่าพยายามส่ง response ซ้ำถ้า header ถูกส่งแล้ว
            if (!res.headersSent) {
              res.status(500).send('Download failed')
            }
          }

          // ✅ ลบไฟล์ทิ้งหลังจากส่งเสร็จ (หรือส่งไม่สำเร็จ)
          fs.unlink(tempPath, () => { })
        }
      )
    } else {
      return res.status(200).json({
        status: 200,
        message: 'Sucess',
        data: allTransactions
      })
    }
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }
}

exports.updateOrderPowerBI = async (req, res) => {
  try {
    const now = new Date()
    const thailandOffset = 7 * 60 // นาที
    const utc = now.getTime() + now.getTimezoneOffset() * 60000
    const thailand = new Date(utc + thailandOffset * 60000)

    const year = thailand.getFullYear()
    const month = String(thailand.getMonth() + 1).padStart(2, '0')
    const day = String(thailand.getDate()).padStart(2, '0')
    const nextDay = String(thailand.getDate() + 1).padStart(2, '0')

    const currentDate = `${year}${month}${day}`
    const startDate = `${year}${month}${day}`
    const endDate = `${year}${month}${nextDay}`
    const status = ''
    // console.log(startDate)
    // console.log(endDate)
    const channel = 'cash'
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { Store } = getModelsByChannel(channel, res, storeModel)

    const invoBi = await dataPowerBiQuery(channel, 'INVO')
    const invoBiList = invoBi.flatMap(item => item.INVO)

    const invoM3 = await dataM3Query(channel)
    const invoM3List = invoM3.flatMap(item => item.OACUOR)

    const allTransactions = await dataPowerBi(
      channel,
      invoBiList,
      status,
      startDate,
      endDate,
      currentDate
    )

    await dataPowerBiQueryInsert(channel, allTransactions)

    const invoBiAfter = await dataPowerBiQuery(channel, 'INVO')
    const invoBiListAfter = invoBiAfter.flatMap(item => item.INVO)

    let alreadyM3 = []
    for (const item of invoBiListAfter) {
      if (invoM3List.includes(item)) {
        alreadyM3.push(item)
      }
    }

    await dataPowerBiQueryDelete(channel, alreadyM3)

    return res.status(200).json({
      status: 200,
      message: 'Sucess',
      data: alreadyM3
    })
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }
}

exports.updateStatusOrderDistribution = async (req, res) => {
  try {
    const channel = 'cash'
    const { Distribution } = getModelsByChannel(channel, res, distributionModel)
    const currentMonth = dayjs().month() + 1 // เดือนปัจจุบัน (1–12)
    const currentYear = dayjs().year()

    // ✅ 1. ดึงข้อมูลจาก WithdrawCash
    const withdrawList = await WithdrawCash.findAll({
      where: {
        WD_STATUS: '22',
        [Op.and]: [
          where(fn('MONTH', col('WD_DATE')), currentMonth),
          where(fn('YEAR', col('WD_DATE')), currentYear)
        ]
      },
      raw: true
    })
    // ✅ 2. สร้าง list WD_NO
    const wdNos = [...new Set(withdrawList.map(i => i.WD_NO))]

    // ✅ 3. ดึงข้อมูลจาก Distribution (Mongo)
    const dataDis = await Distribution.find({
      orderId: { $in: wdNos }
    }).lean()

    // ✅ 4. สร้าง map จาก Mongo เพื่อหาของเร็ว
    // ✅ รวม dis + listProduct ลงใน Map
    const disMap = new Map()
    for (const dis of dataDis) {
      if (!dis.listProduct) continue
      disMap.set(dis.orderId, { dis, listProduct: dis.listProduct })
    }

    // ✅ 5. วนลูปอัปเดตแต่ละแถวใน WithdrawCash

    // ✅ ใช้ตอนอัปเดต
    for (const row of withdrawList) {
      const data = disMap.get(row.WD_NO)
      if (!data) continue

      const { dis, listProduct } = data
      const product = listProduct.find(p => p.id === row.ITEM_CODE)

      if (product) {
        await WithdrawCash.update(
          {
            WD_STATUS: dis.status == 'confirm' ? '99' : '22',
            ITEM_WEIGHT: product.weightGross ?? 0,
            TOTAL_WEIGHT: product.weightNet ?? 0,
            SHIP_QTY: product.receiveQty ?? 0,
            REMARK_WAREHOUSE: dis.remarkWarehouse?.remark ?? '',
            IS_NPD: product.isNPD ? 'TRUE' : 'FALSE'
          },
          {
            where: {
              WD_NO: row.WD_NO,
              ITEM_CODE: row.ITEM_CODE
            }
          }
        )
      }
    }
    return res.status(200).json({
      status: 200,
      message: 'Sucess'
      // data: data
    })
  } catch (error) {
    console.error('Error in updateStatusOrderDistribution:', error)
    res.status(500).json({
      status: 500,
      message: 'Internal server error',
      error: error.message
    })
  }
}

exports.updateOrderDistribution = async (req, res) => {
  try {
    const { period } = req.body
    const channel = req.headers['x-channel']

    const { startDate, endDate } = rangeDate(period)

    const yearStart = startDate.getFullYear()
    const monthStart = String(startDate.getMonth() + 1).padStart(2, '0')
    const dayStart = String(startDate.getDate()).padStart(2, '0')

    const yearEnd = endDate.getFullYear()
    const monthEnd = String(endDate.getMonth() + 1).padStart(2, '0')
    const dayEnd = String(endDate.getDate()).padStart(2, '0')


    const startDateTran = `${yearStart}${monthStart}${dayStart}`
    const endDateTran = `${yearEnd}${monthEnd}${dayEnd}`

    const status = ''
    const allTransactions = await dataWithdraw(
      channel,
      status,
      startDateTran,
      endDateTran
    )
    await dataWithdrawInsert(channel, allTransactions)

    return res.status(200).json({
      status: 200,
      message: 'Sucess',
      data: allTransactions
    })
  } catch (error) {
    console.error('Error in updateOrderDistribution:', error)
    res.status(500).json({
      status: 500,
      message: 'Internal server error',
      error: error.message
    })
  }
}

exports.getTargetProduct = async (req, res) => {
  try {
    const { period, area, team, zone } = req.query
    const channel = req.headers['x-channel']
    const { Store } = getModelsByChannel(channel, res, storeModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Stock, AdjustStock } = getModelsByChannel(channel, res, stockModel)
    const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)
    const { Giveaway } = getModelsByChannel(channel, res, giveModel)
    const { Target } = getModelsByChannel(channel, res, targetModel)
    const { targetProduct } = getModelsByChannel(
      channel,
      res,
      targetProductModel
    )

    const query = { period }
    if (area) query.area = area

    const targetProductData = await targetProduct.find(query).lean()

    // กันกรณี grp_target เป็น undefined/null แล้วทำ flatMap พัง
    const listGroupM3 = [
      ...new Set(targetProductData.flatMap(item => item.grp_target ?? []))
    ]

    const productData = await Product.find().lean()

    // ใช้ $lt แทน $lte (แนะนำให้กำหนด endOfMonthUTC = วันแรกของเดือนถัดไป 00:00:00Z)
    const baseFilter = { period }

    if (area) baseFilter['store.area'] = area

    const teamFilter = {}
    if (team) teamFilter['team3'] = team

    const zoneFilter = {}
    if (zone) zoneFilter['store.zone'] = zone

    const [dataRefund, dataOrderSale, dataOrderChange] = await Promise.all([
      Refund.aggregate([
        {
          $addFields: {
            team3: {
              $concat: [
                { $substrCP: ['$store.area', 0, 2] },
                { $substrCP: ['$store.area', 3, 1] }
              ]
            }
          }
        },
        {
          $match: {
            ...baseFilter,
            ...teamFilter,
            ...zoneFilter,
            type: 'refund',
            status: { $nin: ['pending', 'canceled', 'reject'] }
          }
        }
      ]),
      Order.aggregate([
        {
          $addFields: {
            team3: {
              $concat: [
                { $substrCP: ['$store.area', 0, 2] },
                { $substrCP: ['$store.area', 3, 1] }
              ]
            }
          }
        },
        {
          $match: {
            ...baseFilter,
            ...teamFilter,
            ...zoneFilter,
            type: 'sale',
            status: { $nin: ['canceled', 'reject'] }
          }
        }
      ]),
      Order.aggregate([
        {
          $addFields: {
            team3: {
              $concat: [
                { $substrCP: ['$store.area', 0, 2] },
                { $substrCP: ['$store.area', 3, 1] }
              ]
            }
          }
        },
        {
          $match: {
            ...baseFilter,
            ...teamFilter,
            ...zoneFilter,
            type: 'change',
            status: { $nin: ['pending', 'canceled', 'reject'] }
          }
        }
      ])
    ])

    const orderSaleTran = [...dataOrderChange, ...dataOrderSale].flatMap(item =>
      item.listProduct.map(i => {
        const productDetail = productData.find(o => o.id === i.id)
        const factor = productDetail.listUnit.find(
          o => o.unit === i.unit
        ).factor
        const factorCtn = productDetail.listUnit.find(
          o => o.unit === 'CTN'
        ).factor
        const groupM3 = productDetail.groupCodeM3
        const groupNameM3 = productDetail.groupM3
        return {
          ...i,
          area: item.store.area,
          groupM3,
          groupNameM3,
          qtyPcs: i.qty * factor,
          factorCtn: factorCtn
        }
      })
    )

    const orderSaleTranMerged = Object.values(
      orderSaleTran.reduce((acc, cur) => {
        const key = `${cur.id}_${cur.area}` // ใช้ id + unit เป็น key
        if (!acc[key]) {
          acc[key] = { ...cur }
        } else {
          acc[key].qty += cur.qty || 0
          acc[key].qtyPcs += cur.qtyPcs || 0
          acc[key].subtotal += cur.subtotal || 0
        }
        return acc
      }, {})
    )

    const orderSaleTranMergedCtn = orderSaleTranMerged.map(item => {
      return {
        ...item,
        qtyCtn: Math.floor(item.qtyPcs / item.factorCtn)
      }
    })

    let areaList = []
    if (area) {
      areaList = [area]
    } else {
      areaList = [
        ...new Set(targetProductData.flatMap(item => item.area ?? []))
      ]
    }
    // console.log(areaList)

    let data = []
    for (const i of areaList) {
      // console.log(i)
      const orderArea = orderSaleTranMergedCtn.filter(item => item.area === i)

      for (const u of orderArea) {
        const targetDetail = targetProductData.find(
          item =>
            item.area === i &&
            item.period === period &&
            item.grp_target === u.groupM3
        )
        // console.log(u.area)
        dataTran = {
          id: targetDetail.id,
          period: period,
          area: i,
          groupCode: u.groupM3,
          group: u.groupNameM3,
          targetQty: targetDetail.tg,
          targetAll: targetDetail.all_amt_target,
          actualCtn: u.qtyCtn,
          actual: u.subtotal,
          unit: 'THB'
        }
        data.push(dataTran)
      }
    }

    const dataFinal = Object.values(
      data.reduce((acc, cur) => {
        const key = `${cur.groupCode}_${cur.area}` // ใช้ id + unit เป็น key
        if (!acc[key]) {
          acc[key] = { ...cur }
        } else {
          acc[key].actualCtn += cur.actualCtn || 0
          acc[key].actual += cur.actual || 0
        }
        return acc
      }, {})
    )

    const result = dataFinal.map(item => ({
      id: item.id,
      period: item.period,
      area: item.area,
      groupCode: item.groupCode,
      group: item.group,
      targetQty: item.targetQty,
      targetAll: item.targetAll,
      actualCtn: item.actualCtn ?? 0,
      actual: to2(item.actual ?? 0),
      unit: item.unit
    }))

    // เรียงตาม area ก่อน แล้ว groupCode ต่อ
    result.sort((a, b) => {
      // 1) เทียบ area ก่อน
      const areaCmp = String(a.area).localeCompare(String(b.area), undefined, {
        numeric: true,
        sensitivity: 'base'
      })
      if (areaCmp !== 0) return areaCmp

      // 2) ถ้า area เท่ากัน ค่อยเทียบ groupCode
      return String(a.groupCode).localeCompare(String(b.groupCode), undefined, {
        numeric: true,
        sensitivity: 'base'
      })
    })

    res.status(200).json({
      status: 200,
      message: 'Sucess',
      data: result
    })
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }
}

exports.getOrderExcelNew = async (req, res) => {
  try {
    const { period, area, team, zone, excel, type } = req.query
    const channel = req.headers['x-channel']

    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Giveaway } = getModelsByChannel(channel, res, giveModel)
    const baseFilter = {}
    if (area) baseFilter['store.area'] = area

    const teamFilter = {}
    if (team) teamFilter['team3'] = team

    const zoneFilter = {}
    if (zone) zoneFilter['store.zone'] = zone

    const [dataOrderSale, dataOrderChange, dataOrderRefund, dataOrderGive] =
      await Promise.all([
        Order.aggregate([
          {
            $addFields: {
              team3: {
                $concat: [
                  { $substrCP: ['$store.area', 0, 2] },
                  { $substrCP: ['$store.area', 3, 1] }
                ]
              }
            }
          },
          {
            $match: {
              ...baseFilter,
              ...teamFilter,
              ...zoneFilter,
              period: period,
              type: 'sale',
              status: { $nin: ['canceled', 'reject'] }
            }
          }
        ]),
        Order.aggregate([
          {
            $addFields: {
              team3: {
                $concat: [
                  { $substrCP: ['$store.area', 0, 2] },
                  { $substrCP: ['$store.area', 3, 1] }
                ]
              }
            }
          },
          {
            $match: {
              ...baseFilter,
              ...teamFilter,
              ...zoneFilter,
              period: period,
              type: 'change',
              status: { $nin: ['pending', 'canceled', 'reject'] }
            }
          }
        ]),
        Refund.aggregate([
          {
            $addFields: {
              team3: {
                $concat: [
                  { $substrCP: ['$store.area', 0, 2] },
                  { $substrCP: ['$store.area', 3, 1] }
                ]
              }
            }
          },
          {
            $match: {
              ...baseFilter,
              ...teamFilter,
              ...zoneFilter,
              period: period,
              type: 'refund',
              status: { $nin: ['pending', 'canceled', 'reject'] }
            }
          }
        ]),
        Giveaway.aggregate([
          {
            $addFields: {
              team3: {
                $concat: [
                  { $substrCP: ['$store.area', 0, 2] },
                  { $substrCP: ['$store.area', 3, 1] }
                ]
              }
            }
          },
          {
            $match: {
              ...baseFilter,
              ...teamFilter,
              ...zoneFilter,
              period: period,
              type: 'give',
              status: { $nin: ['canceled', 'reject'] }
            }
          }
        ])
      ])

    const dataOrderPro = dataOrderSale.flatMap(item =>
      (item.listPromotions ?? []).map(promo => ({
        ...promo,
        orderId: item.orderId,
        type: 'pro'
      }))
    )

    let dataSale = []
    const productData = await Product.find()

    for (const i of [...dataOrderSale, ...dataOrderPro]) {
      // console.log(i)
      for (const item of i.listProduct ?? []) {
        if (!item.id || item.id.trim() === '' || item.unit == '') {
          continue
        }

        const productDetail = productData.find(o => o.id === item.id)
        const units = productDetail?.listUnit ?? []
        const unitCtn = units.find(u => u.unit === 'CTN') ?? {}
        const unitBag = units.find(u => ['BAG', 'PAC'].includes(u.unit)) ?? {}
        const unitPcs = units.find(u => ['BOT', 'PCS'].includes(u.unit)) ?? {}

        let ctnQty = 0
        let ctnPrice = 0
        let bagQty = 0
        let bagPrice = 0
        let pcsQty = 0
        let pcsPrice = 0

        if (item.unit === 'CTN') {
          // logic สำหรับ CTN
          ctnQty = item.qty
          ctnPrice = item.price
          factor = unitCtn.factor
        } else if (item.unit === 'BAG' || item.unit === 'PAC') {
          // logic สำหรับ BAG หรือ PAC
          bagQty = item.qty
          bagPrice = item.price
          factor = unitBag.factor
        } else if (item.unit === 'BOT' || item.unit === 'PCS') {
          // logic สำหรับ BOT หรือ PCS
          pcsQty = item.qty
          pcsPrice = item.price
          factor = unitPcs.factor
        }

        // if (i.type === 'pro') {
        //   typedetail = 'Promotion'
        // } else {
        //   typedetail = 'Sale'
        // }
        // console.log(item.id)
        const dataTran = {
          // orderId: i.orderId,
          productId: item.id,
          productName: item.name,
          productGroup: productDetail.groupCodeM3,
          size: productDetail.size,
          ctnQty,
          ctnPrice: ctnPrice ?? 0,
          bagQty,
          bagPrice: bagPrice ?? 0,
          pcsQty,
          pcsPrice: pcsPrice ?? 0,
          sumPrice: item.subtotal ?? 0,
          sumPcs: (factor ?? 1) * item.qty
          // type: typedetail
        }
        dataSale.push(dataTran)
      }
    }

    let dataSaleArray = Object.values(
      dataSale.reduce((acc, curr) => {
        const key = `${curr.productId}`
        if (acc[key]) {
          acc[key] = {
            ...curr,
            ctnQty: (acc[key].ctnQty || 0) + (curr.ctnQty || 0),
            ctnPrice: (acc[key].ctnPrice || 0) + (curr.ctnPrice || 0),
            bagQty: (acc[key].bagQty || 0) + (curr.bagQty || 0),
            bagPrice: (acc[key].bagPrice || 0) + (curr.bagPrice || 0),
            pcsQty: (acc[key].pcsQty || 0) + (curr.pcsQty || 0),
            pcsPrice: (acc[key].pcsPrice || 0) + (curr.pcsPrice || 0),
            sumPrice: (acc[key].sumPrice || 0) + (curr.sumPrice || 0),
            sumPcs: (acc[key].sumPcs || 0) + (curr.sumPcs || 0)
          }
        } else {
          acc[key] = { ...curr }
        }
        return acc
      }, {})
    )

    let dataRefundChangeTran = []

    // for (const i of [...dataOrderChange, ...dataOrderRefund]) {
    for (const i of [...dataOrderChange, ...dataOrderRefund]) {
      if (i.type === 'change') {
        typedetail = 'change'
      } else {
        typedetail = 'refund'
      }

      for (const item of i.listProduct ?? []) {
        if (!item.id || item.id.trim() === '') {
          continue
        }

        const productDetail = productData.find(o => o.id === item.id)
        const units = productDetail?.listUnit ?? []
        const unitCtn = units.find(u => u.unit === 'CTN') ?? {}
        const unitBag = units.find(u => ['BAG', 'PAC'].includes(u.unit)) ?? {}
        const unitPcs = units.find(u => ['BOT', 'PCS'].includes(u.unit)) ?? {}

        let ctnQty = 0
        let ctnPrice = 0
        let bagQty = 0
        let bagPrice = 0
        let pcsQty = 0
        let pcsPrice = 0

        if (item.unit === 'CTN') {
          // logic สำหรับ CTN
          ctnQty = item.qty
          ctnPrice = item.price
          factor = unitCtn.factor
        } else if (item.unit === 'BAG' || item.unit === 'PAC') {
          // logic สำหรับ BAG หรือ PAC
          bagQty = item.qty
          bagPrice = item.price
          factor = unitBag.factor
        } else if (item.unit === 'BOT' || item.unit === 'PCS') {
          // logic สำหรับ BOT หรือ PCS
          pcsQty = item.qty
          pcsPrice = item.price
          factor = unitPcs.factor
        }

        if (typedetail === 'change') {
          sumPrice = item.subtotal
        } else {
          sumPrice = item.total
        }

        const dataTran = {
          // orderId: i.orderId,
          productId: item.id,
          productName: item.name,
          productGroup: productDetail.groupCodeM3,
          size: productDetail.size,
          ctnQty,
          ctnPrice: ctnPrice ?? 0,
          bagQty,
          bagPrice: bagPrice ?? 0,
          pcsQty,
          pcsPrice: pcsPrice ?? 0,
          sumPrice: sumPrice,
          sumPcs: (factor ?? 1) * item.qty,
          type: typedetail,
          refundType: item.condition ?? ''
          // ref: i.reference ?? ''
        }
        dataRefundChangeTran.push(dataTran)
      }
    }

    let dataRefundChange = Object.values(
      dataRefundChangeTran.reduce((acc, curr) => {
        const key = `${curr.productId}_${curr.type}_${curr.refundType}`
        if (acc[key]) {
          acc[key] = {
            ...curr,
            ctnQty: (acc[key].ctnQty || 0) + (curr.ctnQty || 0),
            ctnPrice: (acc[key].ctnPrice || 0) + (curr.ctnPrice || 0),
            bagQty: (acc[key].bagQty || 0) + (curr.bagQty || 0),
            bagPrice: (acc[key].bagPrice || 0) + (curr.bagPrice || 0),
            pcsQty: (acc[key].pcsQty || 0) + (curr.pcsQty || 0),
            pcsPrice: (acc[key].pcsPrice || 0) + (curr.pcsPrice || 0),
            sumPrice: (acc[key].sumPrice || 0) + (curr.sumPrice || 0),
            sumPcs: (acc[key].sumPcs || 0) + (curr.sumPcs || 0)
          }
        } else {
          acc[key] = { ...curr }
        }
        return acc
      }, {})
    )

    const dataGive = []

    for (const i of [...dataOrderGive]) {
      for (const item of i.listProduct ?? []) {
        if (!item.id || item.id.trim() === '') {
          continue
        }

        const productDetail = productData.find(o => o.id === item.id)
        const units = productDetail?.listUnit ?? []
        const unitCtn = units.find(u => u.unit === 'CTN') ?? {}
        const unitBag = units.find(u => ['BAG', 'PAC'].includes(u.unit)) ?? {}
        const unitPcs = units.find(u => ['BOT', 'PCS'].includes(u.unit)) ?? {}

        let ctnQty = 0
        let ctnPrice = 0
        let bagQty = 0
        let bagPrice = 0
        let pcsQty = 0
        let pcsPrice = 0

        if (item.unit === 'CTN') {
          // logic สำหรับ CTN
          ctnQty = item.qty
          ctnPrice = item.price
          factor = unitCtn.factor
        } else if (item.unit === 'BAG' || item.unit === 'PAC') {
          // logic สำหรับ BAG หรือ PAC
          bagQty = item.qty
          bagPrice = item.price
          factor = unitBag.factor
        } else if (item.unit === 'BOT' || item.unit === 'PCS') {
          // logic สำหรับ BOT หรือ PCS
          pcsQty = item.qty
          pcsPrice = item.price
          factor = unitPcs.factor
        }

        const dataTran = {
          // orderId: i.orderId,
          productId: item.id,
          productName: item.name,
          productGroup: productDetail.groupCodeM3,
          size: productDetail.size,
          ctnQty,
          ctnPrice: ctnPrice ?? 0,
          bagQty,
          bagPrice: bagPrice ?? 0,
          pcsQty,
          pcsPrice: pcsPrice ?? 0,
          sumPrice: item.total,
          sumPcs: (factor ?? 1) * item.qty,
          type: i.type
        }
        dataGive.push(dataTran)
      }
    }

    let dataGiveArray = Object.values(
      dataGive.reduce((acc, curr) => {
        const key = `${curr.productId}`
        if (acc[key]) {
          acc[key] = {
            ...curr,
            ctnQty: (acc[key].ctnQty || 0) + (curr.ctnQty || 0),
            ctnPrice: (acc[key].ctnPrice || 0) + (curr.ctnPrice || 0),
            bagQty: (acc[key].bagQty || 0) + (curr.bagQty || 0),
            bagPrice: (acc[key].bagPrice || 0) + (curr.bagPrice || 0),
            pcsQty: (acc[key].pcsQty || 0) + (curr.pcsQty || 0),
            pcsPrice: (acc[key].pcsPrice || 0) + (curr.pcsPrice || 0),
            sumPrice: (acc[key].sumPrice || 0) + (curr.sumPrice || 0),
            sumPcs: (acc[key].sumPcs || 0) + (curr.sumPcs || 0)
          }
        } else {
          acc[key] = { ...curr }
        }
        return acc
      }, {})
    )

    dataSaleArray = sortProduct(dataSaleArray, 'productGroup')
    dataRefundChange = sortProduct(dataRefundChange, 'productGroup')
    dataGiveArray = sortProduct(dataGiveArray, 'productGroup')

    if (excel == 'true') {
      function zeroToDash(value) {
        return value === 0 ? '-' : value
      }
      const dataSaleFinal = dataSaleArray.map(item => {
        return {
          // invoice: item.orderId,
          รหัสสินค้า: item.productId,
          รายละเอียดสินค้า: item.productName,
          หีบ: zeroToDash(item.ctnQty),
          ราคาหีบ: zeroToDash(item.ctnPrice),
          'ถุง/แพ็ค': zeroToDash(item.bagQty),
          ราคาถุง: zeroToDash(item.bagPrice),
          'ซอง/ขวด': zeroToDash(item.pcsQty),
          ราคาซอง: zeroToDash(item.pcsPrice),
          จำนวนเงิน: zeroToDash(item.sumPrice),
          จำนวนรวมชิ้น: zeroToDash(item.sumPcs)
          // ประเภทรายการ: item.type
        }
      })

      const dataRefundFinal = dataRefundChange.map(item => {
        return {
          // invoice: item.orderId,
          รหัสสินค้า: item.productId,
          รายละเอียดสินค้า: item.productName,
          หีบ: zeroToDash(item.ctnQty),
          ราคาหีบ: zeroToDash(item.ctnPrice),
          'ถุง/แพ็ค': zeroToDash(item.bagQty),
          ราคาถุง: zeroToDash(item.bagPrice),
          'ซอง/ขวด': zeroToDash(item.pcsQty),
          ราคาซอง: zeroToDash(item.pcsPrice),
          จำนวนเงิน: zeroToDash(item.sumPrice),
          จำนวนรวมชิ้น: zeroToDash(item.sumPcs),
          ประเภทรายการ: item.type,
          ประเภทการคืน: item.refundType
          // ref: item.ref
        }
      })

      const dataGiveFinal = dataGiveArray.map(item => {
        return {
          // invoice: item.orderId,
          รหัสสินค้า: item.productId,
          รายละเอียดสินค้า: item.productName,
          หีบ: zeroToDash(item.ctnQty),
          ราคาหีบ: zeroToDash(item.ctnPrice),
          'ถุง/แพ็ค': zeroToDash(item.bagQty),
          ราคาถุง: zeroToDash(item.bagPrice),
          'ซอง/ขวด': zeroToDash(item.pcsQty),
          ราคาซอง: zeroToDash(item.pcsPrice),
          จำนวนเงิน: zeroToDash(item.sumPrice),
          จำนวนรวมชิ้น: zeroToDash(item.sumPcs),
          ประเภทรายการ: item.type
        }
      })

      const parts = [area, team, zone].filter(v => v) // เก็บเฉพาะค่าที่ truthy (ไม่ว่าง/null/undefined)
      const fileName = `CheckOrderProduct_${parts.join('_')}.xlsx`
      const tempPath = path.join(os.tmpdir(), fileName)

      const wb = xlsx.utils.book_new()

      // ✅ สร้าง 2 sheet แยก
      const wsSale = xlsx.utils.json_to_sheet(dataSaleFinal)
      const wsRefund = xlsx.utils.json_to_sheet(dataRefundFinal)
      const wsGive = xlsx.utils.json_to_sheet(dataGiveFinal)
      // ✅ เพิ่มเข้า workbook เป็น 2 ชีต

      if (type === 'sale') {
        xlsx.utils.book_append_sheet(wb, wsSale, `Sale`)
      } else if (type === 'refund') {
        xlsx.utils.book_append_sheet(wb, wsRefund, `Refund`)
      } else if (type === 'give') {
        xlsx.utils.book_append_sheet(wb, wsGive, `Give`)
      } else {
        xlsx.utils.book_append_sheet(wb, wsSale, `Sale`)
        xlsx.utils.book_append_sheet(wb, wsRefund, `Refund`)
        xlsx.utils.book_append_sheet(wb, wsGive, `Give`)
      }

      // ✅ เขียนไฟล์ไปยัง tempPath (ต้องเขียนที่เดียวกับที่กำลังจะดาวน์โหลด)
      xlsx.writeFile(wb, tempPath)

      // ✅ ส่งไฟล์ให้ดาวน์โหลด แล้วค่อยลบทิ้ง
      res.download(tempPath, fileName, err => {
        if (err) {
          console.error('❌ Download error:', err)
          if (!res.headersSent) {
            res.status(500).send('Download failed')
          }
        }
        // ลบไฟล์ทิ้งหลังจบ (สำเร็จหรือไม่ก็ตาม)
        fs.unlink(tempPath, () => { })
      })
    } else {
      return res.status(200).json({
        status: 200,
        message: 'Sucess',
        data: {
          dataSaleArray,
          dataRefundChange,
          dataGiveArray
        }
      })
    }
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }
}

exports.updatePaymentOrder = async (req, res) => {
  try {
    const { orderId, paymentMethod } = req.body
    const channel = req.headers['x-channel']
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { User } = getModelsByChannel(channel, res, userModel)
    const dataOrder = await Order.findOne({ orderId: orderId })

    let updateOrder = ''
    if (!dataOrder) {
      return res.status(200).json({
        status: 404,
        message: 'Not found order'
      })
    } else {
      updateOrder = await Order.findOneAndUpdate(
        { orderId: orderId },
        { $set: { paymentMethod: paymentMethod } },
        { new: true }
      )
    }

    res.status(200).json({
      status: 200,
      message: 'success',
      data: updateOrder
    })
  } catch (error) {
    console.error('Error in updatePaymentOrder:', error)
    res.status(500).json({
      status: 500,
      message: 'Internal server error',
      error: error.message
    })
  }
}

exports.updateAddressInOrder = async (req, res) => {
  try {
    const { storeId } = req.body
    const channel = req.headers['x-channel']
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Store } = getModelsByChannel(channel, res, storeModel)

    const storeData = await Store.findOne({ storeId: storeId })
    const dataOrder = await Order.find({ 'store.storeId': storeId })

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

    for (i of dataOrder) {
      // await i.findOneAndUpdate(
      //   { orderId: i.orderId },
      //   {
      //     $set: {
      //       'store.address':addressFinal
      //   }
      //   }
      // )
    }

    res.status(200).json({
      status: 200,
      message: 'Sucess',
      data: dataOrder
    })
  } catch (error) {
    console.error('Error in updatePaymentOrder:', error)
    res.status(500).json({
      status: 500,
      message: 'Internal server error',
      error: error.message
    })
  }
}

exports.addTarget = async (req, res) => {
  try {
    const { storeId } = req.body
    const channel = req.headers['x-channel']
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Store } = getModelsByChannel(channel, res, storeModel)

    // const storeData = await Store.findOne({ storeId: storeId })
    // const dataOrder = await Order.find({ 'store.storeId': storeId })

    res.status(200).json({
      status: 200,
      message: 'Sucess',
      data: dataOrder
    })
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }
}

exports.updateUserSaleInOrder = async (req, res) => {
  try {
    const { area, period } = req.body
    const channel = req.headers['x-channel']

    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { Giveaway } = getModelsByChannel(channel, res, giveModel)
    const { User } = getModelsByChannel(channel, res, userModel)

    const sale = await User.findOne({ area })

    if (!sale) {
      return res.status(404).json({
        status: 404,
        message: `❌ ไม่พบ sale ในพื้นที่ ${area}`
      })
    }

    const saleInfo = {
      saleCode: sale.saleCode,
      salePayer: sale.salePayer,
      name: `${sale.firstName} ${sale.surName}`,
      tel: sale.tel || '',
      warehouse: sale.warehouse
    }

    const [orderResult, refundResult, giveawayResult] = await Promise.all([
      Order.updateMany(
        { period, 'store.area': area },
        { $set: { sale: saleInfo } }
      ),
      Refund.updateMany(
        { period, 'store.area': area },
        { $set: { sale: saleInfo } }
      ),
      Giveaway.updateMany(
        { period, 'store.area': area },
        { $set: { sale: saleInfo } }
      )
    ])

    const totalUpdated =
      (orderResult.modifiedCount || 0) +
      (refundResult.modifiedCount || 0) +
      (giveawayResult.modifiedCount || 0)

    console.log(
      `✅ อัปเดต Order:${orderResult.modifiedCount} | Refund:${refundResult.modifiedCount} | Giveaway:${giveawayResult.modifiedCount}`
    )

    return res.status(200).json({
      status: 200,
      message: 'Success',
      data: {
        orderUpdated: orderResult.modifiedCount,
        refundUpdated: refundResult.modifiedCount,
        giveawayUpdated: giveawayResult.modifiedCount,
        totalUpdated
      }
    })
  } catch (error) {
    console.error('❌ updateUserSaleInOrder error:', error)
    return res.status(500).json({
      status: 500,
      message: 'Server error',
      error: error.message
    })
  }
}

exports.m3ToOrderMongo = async (req, res) => {
  try {
    const { orderId, period, type } = req.body
    const channel = req.headers['x-channel']

    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { User } = getModelsByChannel(channel, res, userModel)
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Store } = getModelsByChannel(channel, res, storeModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)

    const dataM3Line = await OOLINE.findAll({
      where: {
        OBCUOR: {
          [Op.in]: Array.isArray(orderId) ? orderId : [orderId]
        }
      },
      raw: true
    })

    const trimmedDataM3Line = dataM3Line.map(record => {
      const trimmedRecord = {}
      for (const [key, value] of Object.entries(record)) {
        if (typeof value === 'string') {
          trimmedRecord[key] = value.trim() // ตัดช่องว่างซ้ายขวา
        } else {
          trimmedRecord[key] = value // เก็บค่าเดิมถ้าไม่ใช่ string
        }
      }
      return trimmedRecord
    })

    const productId = dataM3Line.map(item => item.OBITNO.trim())

    const dataM3Head = await OOHEAD.findOne({
      where: { OACUOR: orderId },
      raw: true
    })

    const trimmedDataM3Head = {}
    for (const [key, value] of Object.entries(dataM3Head || {})) {
      trimmedDataM3Head[key] = typeof value === 'string' ? value.trim() : value
    }

    const productData = await Product.find({
      id: { $in: productId }
    })

    let listProduct = []

    for (const item of trimmedDataM3Line) {
      const productDetail = productData.find(u => u.id === item.OBITNO.trim())
      // const unitName
      if (item.OBSAPR === 0 && item.OBLNA2 === 0) {
      } else {
        const data = {
          id: productDetail.id,
          name: productDetail.name,
          groupCode: productDetail.groupCode,
          group: productDetail.group,
          brandCode: productDetail.brandCode,
          brand: productDetail.brand,
          size: productDetail.size,
          flavourCode: productDetail.flavourCode,
          flavour: productDetail.flavour,
          qty: Math.abs(Number(item.OBIVQA)),
          unit: item.OBALUN,
          unitName: '',
          price: item.OBSAPR,
          total: Math.abs(Number(item.OBLNA2)),
          subtotal: item.OBLNA2,
          discount: 0,
          netTotal: item.OBLNA2,
          condition: 'damaged'
        }
        listProduct.push(data)
      }
    }
    const saleData = await User.findOne({ warehouse: trimmedDataM3Head.OAWHLO })
    const storeData = await Store.findOne({ storeId: trimmedDataM3Head.OACUNO })
    const total = Math.abs(Number(trimmedDataM3Head.OABRLA))
    const count = trimmedDataM3Line.filter(item => item.OBITNO).length

    if (['change', 'sale'].includes(type)) {
      data = {
        type: 'change',
        orderId: orderId,
        routeId: '',
        sale: {
          saleCode: trimmedDataM3Head.OASMCD,
          salePayer: trimmedDataM3Head.OAPYNO,
          name: `${saleData.firstName} ${saleData.surName}`,
          tel: saleData.tel,
          warehouse: trimmedDataM3Head.OAWHLO
        },
        store: {
          storeId: trimmedDataM3Head.OACUNO,
          // name: storeData.,
          type: storeData.type,
          address: storeData.name,
          taxId: storeData.taxId,
          tel: storeData.tel,
          area: storeData.area,
          zone: storeData.zone
        },
        shipping: {
          default: '1',
          shippingId: '',
          address: '',
          district: '',
          subDistrict: '',
          province: '',
          postCode: '',
          latitude: '0',
          longtitude: '0'
        },
        note: 'จาก M3 มา MONGO (เคส ทุจริต)',
        latitude: '0.00',
        longitude: '0.00',
        status: 'completed',
        statusTH: 'สำเร็จ',
        listProduct: listProduct,
        listPromotions: [],
        subtotal: total,
        discount: 0,
        discountProductId: [],
        discountProduct: 0,
        vat: parseFloat((total - total / 1.07).toFixed(2)),
        totalExVat: parseFloat((total / 1.07).toFixed(2)),
        qr: 0,
        total: total,
        paymentMethod: 'cash',
        paymentStatus: 'unpaid',
        reference: '6811932220003',
        period: period,
        listQuota: [],
        listImage: [],
        createdAt: '',
        updatedAt: '',
        heightStatus: trimmedDataM3Head.OAORSL,
        lineM3: `${count}`,
        lowStatus: trimmedDataM3Head.OAORST,
        orderNo: trimmedDataM3Head.OAORNO,
        createdAt: trimmedDataM3Head.OARLDT
      }

      await Order.create(data)
    } else if (type === 'refund') {
      data = {
        type: 'refund',
        orderId: orderId,
        sale: {
          saleCode: trimmedDataM3Head.OASMCD,
          salePayer: trimmedDataM3Head.OAPYNO,
          name: `${saleData.firstName} ${saleData.surName}`,
          tel: saleData.tel,
          warehouse: trimmedDataM3Head.OAWHLO
        },
        store: {
          storeId: trimmedDataM3Head.OACUNO,
          // name: storeData.,
          type: storeData.type,
          address: storeData.name,
          taxId: storeData.taxId,
          tel: storeData.tel,
          area: storeData.area,
          zone: storeData.zone
        },
        note: 'จาก M3 มา MONGO (เคส ทุจริต)',
        latitude: '0.00',
        longitude: '0.00',
        status: 'completed',
        statusTH: 'สำเร็จ',
        listProduct: listProduct,
        listPromotions: [],
        subtotal: total,
        discount: 0,
        discountProductId: [],
        discountProduct: 0,
        vat: parseFloat((total - total / 1.07).toFixed(2)),
        totalExVat: parseFloat((total / 1.07).toFixed(2)),
        qr: 0,
        total: total,
        paymentMethod: 'cash',
        paymentStatus: 'unpaid',
        reference: '6811132220044',
        period: period,
        listQuota: [],
        listImage: [],
        createdAt: '',
        updatedAt: '',
        heightStatus: trimmedDataM3Head.OAORSL,
        lineM3: `${count}`,
        lowStatus: trimmedDataM3Head.OAORST,
        orderNo: trimmedDataM3Head.OAORNO,
        createdAt: trimmedDataM3Head.OARLDT
      }

      await Refund.create(data)
    }

    res.status(201).json({
      status: 201,
      message: 'Insert success',
      data: data
    })
  } catch (error) {
    console.error('error:', error)
    return res.status(500).json({
      status: 500,
      message: 'Server error',
      error: error.message
    })
  }
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj)
}

exports.editOrderSale = async (req, res) => {
  try {
    const { orderId } = req.params
    const { name, address, taxId, tel, user } = req.body

    if (!user) {
      return res.status(401).json({
        status: 401,
        message: 'user is required'
      })
    }

    const data = {
      'store.name': name,
      'store.address': address,
      'store.taxId': taxId,
      'store.tel': tel
    }

    // clean empty fields
    Object.keys(data).forEach(key => {
      if (!data[key]) delete data[key]
    })

    const channel = req.headers['x-channel']
    const { Order, OrderHisLog } = getModelsByChannel(channel, res, orderModel)

    const dataOrder = await Order.findOne({ orderId })
    if (!dataOrder) {
      return res.status(404).json({ status: 404, message: 'Not found order' })
    }

    // history detect changes
    const editableFields = [
      'store.name',
      'store.address',
      'store.taxId',
      'store.tel'
    ]

    const history = {
      editPerson: user,
      editAt: new Date()
    }

    editableFields.forEach(field => {
      const oldVal = getNestedValue(dataOrder, field)
      const newVal = data[field] // new value stored as "store.name"

      if (newVal !== undefined && newVal !== oldVal) {
        const key = field.split('.')[1] // name, address, taxId, tel
        history[key] = newVal
        history[key + 'Old'] = oldVal
      }
    })

    // nothing changed
    if (Object.keys(history).length === 2) {
      return res.status(400).json({
        status: 400,
        message: 'Nothing changed'
      })
    }

    // update
    await Order.findOneAndUpdate({ orderId }, { $set: data }, { new: true })

    await OrderHisLog.create(history)

    return res.status(200).json({
      status: 200,
      message: 'update success',
      data: history
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({
      status: 500,
      message: 'Server error',
      error: error.message
    })
  }
}

exports.updateProCodeInOrder = async (req, res) => {
  try {
    const { period } = req.body
    const channel = req.headers['x-channel']
    const { Promotion, PromotionShelf, Quota } = getModelsByChannel(
      channel,
      res,
      promotionModel
    )
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const orderData = await Order.find({ period: period })
    const promotionData = await Promotion.find({ status: 'active' })

    let data = []

    for (const item of orderData) {
      for (const promo of item.listPromotions) {
        console.log('old proCode:', promo.proCode)

        // 👉 แก้ค่าที่ต้องการ
        promo.proCode = 'FV1P'
      }

      // 👉 SAVE document กลับ MongoDB
      await item.save()
    }

    res.status(201).json({
      status: 200,
      message: 'updateProCodeInOrder success',
      data: orderData
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({
      status: 500,
      message: 'Server error',
      error: error.message
    })
  }
}
