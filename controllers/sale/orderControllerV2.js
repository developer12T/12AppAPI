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
  toThaiTime
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
  generateOrderIdFoodTruck,
  generateOrderIdDammy
} = require('../../utilities/genetateId')
const { sortProduct } = require('../../utilities/product')
const {
  summaryOrder,
  summaryOrderProStatusOne
} = require('../../utilities/summary')
// const { fn, col } = require('sequelize')
const { sequelize, DataTypes } = require('../../config/m3db')
const { rangeDate } = require('../../utilities/datetime')
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


const orderTimestamps = {}

exports.checkOutV2 = async (req, res) => {
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

      if (storeId.length > 11) {
        orderId = await generateOrderIdDammy(area, sale.warehouse, channel, res)
        approveStore = false 
      } else {
        orderId = await generateOrderId(area, sale.warehouse, channel, res)
        approveStore = true 
      }


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

    if (approveStore === false) {
      orderStatus = 'wait approve'
      orderStatusTH = 'รออนุมัติร้านค้า'
    } else {
      orderStatus = 'pending'
      orderStatusTH = 'รอนำเข้า'
    }


    const total = subtotal - discountProduct
    const newOrder = new Order({
      orderId,
      routeId,
      type,
      status: orderStatus,
      statusTH: orderStatusTH,
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
