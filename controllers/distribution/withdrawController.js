const {
  MHDISL,
  MHDISH,
  DisributionM3,
  MGLINE
} = require('../../models/cash/master')
const { sequelize, DataTypes } = require('../../config/m3db')
const { getSeries, updateRunningNumber } = require('../../middleware/order')
const axios = require('axios')
const {
  generateDistributionId,
  generateDistributionIdCredit
} = require('../../utilities/genetateId')
const { rangeDate } = require('../../utilities/datetime')
const {
  period,
  previousPeriod,
  toThaiTime,
  formatDate,
  formatDateToYYYYMMDD
} = require('../../utilities/datetime')
const multer = require('multer')
const cartModel = require('../../models/cash/cart')
const productModel = require('../../models/cash/product')
const distributionModel = require('../../models/cash/distribution')
const userModel = require('../../models/cash/user')
const npdModel = require('../../models/cash/npd')
const stockModel = require('../../models/cash/stock')
const optionsModel = require('../../models/cash/option')
const { withdrawQuery } = require('../../controllers/queryFromM3/querySctipt')
const { getModelsByChannel } = require('../../middleware/channel')
const { query } = require('mssql')
const { exists } = require('fs')
const DistributionModel = require('../../models/cash/distribution')
require('dotenv').config()
const { Op } = require('sequelize')
const { formatDateTimeToThai } = require('../../middleware/order')
const { to2, updateStockMongo } = require('../../middleware/order')
const { getSocket } = require('../../socket')
const { sendEmail } = require('../../middleware/order')
const product = require('../../models/cash/product')
const approveLogModel = require('../../models/cash/approveLog')
const xlsx = require('xlsx')
const path = require('path')
const os = require('os')
const fs = require('fs')
const { orderBy, reduce } = require('lodash')

exports.checkout = async (req, res) => {
  const transaction = await sequelize.transaction()
  try {
    const {
      type,
      area,
      shippingId,
      withdrawType,
      sendDate,
      note,
      period,
      newtrip
    } = req.body

    const today = new Date()
    const day = today.getDate()

    if (day >= 1 && day <= 15) {
      newtrip = false
    }

    const channel = req.headers['x-channel']
    const { Cart } = getModelsByChannel(channel, res, cartModel)
    const { User } = getModelsByChannel(channel, res, userModel)
    const { Place } = getModelsByChannel(channel, res, distributionModel)
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Distribution } = getModelsByChannel(channel, res, distributionModel)
    const { Npd, NpdArea } = getModelsByChannel(channel, res, npdModel)
    const { Stock, StockMovementLog, StockMovement } = getModelsByChannel(
      channel,
      res,
      stockModel
    )

    if (!type || !area || !withdrawType || !sendDate || !note) {
      return res
        .status(400)
        .json({ status: 400, message: 'Missing required fields!' })
    }

    const cart = await Cart.findOne({ type, area })
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

    const shippingData = await Place.findOne(
      { area, 'listAddress.shippingId': shippingId },
      { 'listAddress.$': 1 }
    )

    if (!shippingData || !shippingData.listAddress.length) {
      return res
        .status(404)
        .json({ status: 404, message: 'Shipping address not found!' })
    }
    const shipping = shippingData.listAddress[0]
    // console.log(shipping)
    let fromWarehouse
    if (withdrawType === 'normal' || withdrawType === 'credit') {
      fromWarehouse = shipping.warehouse?.normal
    } else {
      fromWarehouse = shipping.warehouse?.clearance
    }

    if (!fromWarehouse) {
      return res.status(400).json({
        status: 400,
        message: 'Invalid withdrawType or missing warehouse data!'
      })
    }

    // console.log("cart",cart)
    const productIds = cart.listProduct.map(p => p.id)
    const products = await Product.find({ id: { $in: productIds } }).select(
      'id name group brand size flavour weightGross weightNet listUnit'
    )

    let subtotal = 0
    let totalQty = 0
    let totalWeightGross = 0
    let totalWeightNet = 0
    let listProduct = cart.listProduct.map(item => {
      //มาเช็คตรงนี้
      const product = products.find(p => p.id === item.id)
      if (!product) {
        return res
          .status(400)
          .json({ status: 400, message: `Product ${item.id} not found!` })
      }

      const unitData = product.listUnit.find(u => u.unit === item.unit)
      if (!unitData) {
        return res
          .status(400)
          .json({ status: 400, message: `Invalid unit for product ${item.id}` })
      }

      const qtyPcs = unitData?.factor * item.qty
      const weightGross = item.qty * product.weightGross
      const weightNet = item.qty * product.weightNet
      const totalPrice = item.qty * unitData.price.sale

      subtotal += totalPrice
      totalQty += item.qty
      totalWeightGross += weightGross
      totalWeightNet += weightNet

      return {
        id: product.id,
        lot: item.lot,
        name: product.name,
        group: product.group,
        brand: product.brand,
        size: product.size,
        flavour: product.flavour,
        qty: item.qty,
        unit: item.unit,
        qtyPcs,
        price: unitData.price.sale,
        total: totalPrice,
        weightGross: parseFloat(weightGross.toFixed(2)),
        weightNet: parseFloat(weightNet.toFixed(2))
      }
    })

    if (listProduct.includes(null)) return
    // if (listProduct.some(p => p === null)) return res.status(400).json({ status: 400, message: 'Invalid product in cart!' })

    let orderId = ''

    if (withdrawType == 'credit') {
      orderId = await generateDistributionIdCredit(
        area,
        sale.warehouse,
        channel,
        res,
        withdrawType
      )
      fromWarehouse = ''
      toWarehouse = ''
    } else {
      orderId = await generateDistributionId(
        area,
        sale.warehouse,
        channel,
        res,
        newtrip
      )
      fromWarehouse = fromWarehouse
      toWarehouse = sale.warehouse
    }

    const newOrder = new Distribution({
      orderId,
      orderType: shipping.type,
      orderTypeName: shipping.typeNameTH,
      withdrawType: withdrawType,
      area,
      fromWarehouse,
      toWarehouse: toWarehouse,
      shippingId: shipping.shippingId,
      shippingRoute: shipping.route,
      shippingName: shipping.name,
      sendAddress: shipping.address,
      sendDate,
      remark: note,
      listProduct,
      total: subtotal,
      totalQty: totalQty,
      totalWeightGross: parseFloat(totalWeightGross.toFixed(2)),
      totalWeightNet: parseFloat(totalWeightNet.toFixed(2)),
      createdBy: sale.username,
      period: period,
      newTrip: 'false'
    })

    if (newtrip === true) {
      const getNpd = await Npd.findOne({
        period: period,
        area: area
      })
      newOrder.newTrip = 'true'
      if (getNpd.isReceived == 'false') {
        const areaNpd = await Npd.findOne({ period: period, area: area })
        // console.log(areaNpdProduct.npd)
        const productList = areaNpd.npd.flatMap(item => item.productId)
        const productNew = await Product.find({ id: { $in: productList } })

        let npdProduct = []
        let totalQtyNpd = 0
        // console.log(areaNpdProduct)
        for (const row of areaNpd.npd) {
          const productDetail = productNew.find(
            item => item.id === row.productId
          )
          // console.log(productDetail)

          const factor = productDetail.listUnit.find(
            item => item.unit === row.unit
          )
          const qtyPcs = row.qty * factor.factor

          const data = {
            id: productDetail.id,
            lot: '',
            name: productDetail.name,
            group: productDetail.group,
            brand: productDetail.brand,
            size: productDetail.size,
            flavour: productDetail.flavour,
            qty: row.qty,
            unit: row.unit,
            qtyPcs: qtyPcs,
            price: factor.price.sale,
            total: factor.price.sale * row.qty,
            weightGross: parseFloat(productDetail.weightGross.toFixed(2)),
            weightNet: parseFloat(productDetail.weightNet.toFixed(2)),
            isNPD: true
          }
          npdProduct.push(data)
          totalQtyNpd += row.qty
        }
        // console.log('npdProduct',npdProduct)
        newOrder.listProduct.push(...npdProduct)
        newOrder.totalQty += totalQtyNpd
        await Npd.findOneAndUpdate(
          { period: period, area: area },
          {
            $set: {
              isReceived: 'true'
            }
          }
        )
      }
    }

    const productQty = newOrder.listProduct.map(u => {
      return {
        id: u.id,
        // lot: u.lot,
        unit: u.unit,
        qty: u.qty,
        statusMovement: 'OUT'
      }
    })

    const calStock = {
      // storeId: refundOrder.store.storeId,
      orderId: newOrder.orderId,
      area: newOrder.area,
      saleCode: sale.saleCode,
      period: period,
      warehouse: newOrder.fromWarehouse,
      status: 'pending',
      statusTH: 'รอนำเข้า',
      action: 'Withdraw',
      type: 'Withdraw',
      product: productQty
    }

    const createdMovement = await StockMovement.create({
      ...calStock
    })

    await StockMovementLog.create({
      ...calStock,
      refOrderId: createdMovement._id
    })

    await newOrder.save()
    await Cart.deleteOne({ type, area })
    await transaction.commit()

    const io = getSocket()
    io.emit('distribution/checkout', {
      status: 200,
      message: 'Checkout successful!',
      data: newOrder
    })

    res.status(200).json({
      status: 200,
      message: 'Checkout successful!',
      // data: { orderId, total: subtotal, qty: totalQty }
      data: newOrder
      // data:listProductWithDraw
    })
  } catch (error) {
    try {
      await transaction.rollback()
    } catch (rollbackErr) {
      console.error('Transaction rollback failed:', rollbackErr)
    }
    console.error('Error saving store to MongoDB:', error)
    res.status(500).json({ status: '500', message: 'Server Error' })
  }
}

exports.addRemark = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { user, remark, orderId } = req.body
    const { Distribution } = getModelsByChannel(channel, res, distributionModel)

    await Distribution.updateOne(
      { orderId: orderId },
      {
        $set: {
          remarkWarehouse: {
            remark: remark,
            user: user
          }
        }
      }
    )
    res.status(200).json({ status: '200', message: 'Update Success' })
  } catch (error) {
    console.error('Error saving store to MongoDB:', error)
    res.status(500).json({ status: '500', message: 'Server Error' })
  }
}

exports.getOrderCredit = async (req, res) => {
  try {
    const { type, area, period, zone, team, year, month, start, end } =
      req.query
    const channel = req.headers['x-channel']

    const { Distribution } = getModelsByChannel(channel, res, distributionModel)
    const { User } = getModelsByChannel(channel, res, userModel)

    // let response = []
    // if (!type) {
    //   return res.status(400).json({ status: 400, message: 'type is required!' })
    // }

    let startDate, endDate

    if (start && end) {
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

    let statusQuery = {}

    statusQuery.status = {
      $in: ['approved', 'rejected', 'success', 'confirm', 'pending']
    }

    // const status = type === 'history' ? { $ne: 'pending' } : 'pending'
    let areaQuery = {}

    if (area) {
      areaQuery.area = area
    } else if (zone) {
      areaQuery.area = { $regex: `^${zone}`, $options: 'i' }
    }

    let query = {
      ...areaQuery,
      ...(period ? { period } : {}),
      withdrawType: 'credit',
      createdAt: { $gte: startDate, $lt: endDate },
      ...statusQuery
    }

    // console.log(query)

    const pipeline = [
      {
        $addFields: {
          team3: {
            $concat: [
              { $substrCP: ['$area', 0, 2] },
              { $substrCP: ['$area', 3, 1] }
            ]
          },
          statusASC: {
            $cond: [
              { $eq: ['$status', 'pending'] },
              0,
              {
                $cond: [
                  { $eq: ['$status', 'approved'] },
                  1,
                  2 // else: rejected (or other status)
                ]
              }
            ]
          }
        }
      },
      { $match: query }
    ]

    if (team) {
      pipeline.push({
        $match: {
          team3: { $regex: `^${team}`, $options: 'i' }
        }
      })
    }

    pipeline.push({
      $sort: { statusASC: 1, createdAt: -1 }
    })

    const order = await Distribution.aggregate(pipeline)

    if (order.length == 0) {
      return res
        .status(404)
        .json({ status: 404, message: 'Distribution order not found!' })
    }

    const response = await Promise.all(
      order.map(async o => {
        // ใช้ o.area ในแต่ละรอบ
        const userData = await User.findOne({
          role: 'sale',
          area: o.area // <--- ใช้อันนี้
        })

        return {
          area: o.area,
          sale: userData
            ? {
                fullname: `${userData.firstName} ${userData.surName}`,
                tel: `${userData.tel}`
              }
            : null,
          orderId: o.orderId,
          // orderNo: o.orderNo,
          // highStatus: o.highStatus,
          // lowStatus: o.lowStatus,
          newTrip: o.newTrip,
          withdrawType: o.withdrawType,
          totalWeightGross: o.totalWeightGross,
          totalWeightNet: o.totalWeightNet,
          orderType: o.orderType,
          orderTypeName: o.orderTypeName,
          sendDate: o.sendDate,
          total: o.totalQty || 0,
          status: o.status,
          createdAt: o.createdAt,
          formmatDate: formatDateTimeToThai(o.createdAt)
        }
      })
    )

    // const io = getSocket()
    // io.emit('distribution/get', {});

    res.status(200).json({
      status: 200,
      message: 'Successful!',
      data: response
    })
  } catch (error) {
    console.error('Error saving store to MongoDB:', error)
    res.status(500).json({ status: '500', message: 'Server Error' })
  }
}

exports.getOrderPending = async (req, res) => {
  try {
    const { type, area, period, zone } = req.query
    const channel = req.headers['x-channel']
    const { Distribution } = getModelsByChannel(channel, res, distributionModel)
    let areaQuery = {}
    let statusQuery = {}

    // console.log(area)
    // console.log(period)
    // console.log(zone)
    let startDate, endDate
    if (area) {
      areaQuery.area = area
    } else if (zone) {
      areaQuery.area = { $regex: `^${zone}`, $options: 'i' }
    }

    // const range = rangeDate(period) // ฟังก์ชันที่คุณมีอยู่แล้ว
    // startDate = range.startDate
    // endDate = range.endDate

    statusQuery.status = {
      $in: ['pending']
    }

    let query = {
      ...areaQuery,
      ...(period ? { period } : {}),
      ...statusQuery
      // createdAt: { $gte: startDate, $lt: endDate }
    }

    const pipeline = [{ $match: query }]
    // console.log(areaQuery.area)
    // console.log(pipeline)
    // console.log(pipeline.status)
    const order = await Distribution.aggregate(pipeline)
    // console.log(order)
    if (order.length == 0) {
      return res
        .status(404)
        .json({ status: 404, message: 'Distribution order not found!' })
    }

    res.status(200).json({
      status: 200,
      message: 'Successful!',
      data: order.length
    })
  } catch (error) {
    console.error('Error saving store to MongoDB:', error)
    res.status(500).json({ status: '500', message: 'Server Error' })
  }
}

exports.getOrder = async (req, res) => {
  try {
    const { type, area, period, zone, team, year, month, start, end } =
      req.query
    const channel = req.headers['x-channel']

    const { Distribution } = getModelsByChannel(channel, res, distributionModel)
    const { User } = getModelsByChannel(channel, res, userModel)

    // let response = []
    // if (!type) {
    //   return res.status(400).json({ status: 400, message: 'type is required!' })
    // }

    let startDate, endDate

    if (start && end) {
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

    let statusQuery = {}

    if (type === 'pending') {
      statusQuery.status = {
        $in: ['pending', 'approved', 'onprocess', 'success', 'supapproved']
      }
    } else if (type === 'history') {
      statusQuery.status = {
        $in: ['rejected', 'confirm']
      }
    }

    // const status = type === 'history' ? { $ne: 'pending' } : 'pending'
    let areaQuery = {}

    if (area) {
      areaQuery.area = area
    } else if (zone) {
      areaQuery.area = { $regex: `^${zone}`, $options: 'i' }
    }

    let query = {
      ...areaQuery,
      ...(period ? { period } : {}),
      // withdrawType: { $ne: 'credit' },
      // createdAt: { $gte: startDate, $lt: endDate },
      ...statusQuery
    }

    // console.log(query)

    const pipeline = [
      {
        $addFields: {
          team3: {
            $concat: [
              { $substrCP: ['$area', 0, 2] },
              { $substrCP: ['$area', 3, 1] }
            ]
          },
          statusASC: {
            $cond: [
              { $eq: ['$status', 'pending'] },
              0,
              {
                $cond: [
                  { $eq: ['$status', 'approved'] },
                  1,
                  2 // else: rejected (or other status)
                ]
              }
            ]
          }
        }
      },
      { $match: query }
    ]

    if (team) {
      pipeline.push({
        $match: {
          team3: { $regex: `^${team}`, $options: 'i' }
        }
      })
    }

    pipeline.push({
      $sort: { statusASC: 1, createdAt: -1 }
    })

    const order = await Distribution.aggregate(pipeline)

    if (order.length == 0) {
      return res
        .status(404)
        .json({ status: 404, message: 'Distribution order not found!' })
    }

    const response = await Promise.all(
      order.map(async o => {
        // ใช้ o.area ในแต่ละรอบ
        const userData = await User.findOne({
          role: 'sale',
          area: o.area // <--- ใช้อันนี้
        })

        return {
          area: o.area,
          sale: userData
            ? {
                fullname: `${userData.firstName} ${userData.surName}`,
                tel: `${userData.tel}`
              }
            : null,
          orderId: o.orderId,
          // orderNo: o.orderNo,
          // highStatus: o.highStatus,
          // lowStatus: o.lowStatus,
          newTrip: o.newTrip,
          withdrawType: o.withdrawType,
          totalWeightGross: o.totalWeightGross,
          totalWeightNet: o.totalWeightNet,
          orderType: o.orderType,
          orderTypeName: o.orderTypeName,
          sendDate: o.sendDate,
          total: o.totalQty || 0,
          status: o.status,
          statusTH: o.statusTH,
          createdAt: o.createdAt,
          formmatDate: formatDateTimeToThai(o.createdAt)
        }
      })
    )

    // const io = getSocket()
    // io.emit('distribution/get', {});

    res.status(200).json({
      status: 200,
      message: 'Successful!',
      data: response
    })
  } catch (error) {
    console.error('Error saving store to MongoDB:', error)
    res.status(500).json({ status: '500', message: 'Server Error' })
  }
}

exports.getOrder2 = async (req, res) => {
  try {
    const { type, area, period, zone, team, year, month, start, end } =
      req.query
    const channel = req.headers['x-channel']

    const { Distribution } = getModelsByChannel(channel, res, distributionModel)
    const { User } = getModelsByChannel(channel, res, userModel)

    // let response = []
    // if (!type) {
    //   return res.status(400).json({ status: 400, message: 'type is required!' })
    // }

    let startDate, endDate

    if (start && end) {
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

    let statusQuery = {}

    if (type === 'pending') {
      statusQuery.status = {
        $in: ['pending', 'approved', 'onprocess', 'success', 'supapproved']
      }
    } else if (type === 'history') {
      statusQuery.status = {
        $in: ['rejected', 'confirm']
      }
    }

    // const status = type === 'history' ? { $ne: 'pending' } : 'pending'
    let areaQuery = {}

    if (area) {
      areaQuery.area = area
    } else if (zone) {
      areaQuery.area = { $regex: `^${zone}`, $options: 'i' }
    }

    let query = {
      ...areaQuery,
      ...(period ? { period } : {}),
      // withdrawType: { $ne: 'credit' },
      // createdAt: { $gte: startDate, $lt: endDate },
      ...statusQuery
    }

    // console.log(query)

    const pipeline = [
      {
        $addFields: {
          team3: {
            $concat: [
              { $substrCP: ['$area', 0, 2] },
              { $substrCP: ['$area', 3, 1] }
            ]
          },
          statusASC: {
            $cond: [
              { $eq: ['$status', 'pending'] },
              0,
              {
                $cond: [
                  { $eq: ['$status', 'approved'] },
                  1,
                  2 // else: rejected (or other status)
                ]
              }
            ]
          }
        }
      },
      { $match: query }
    ]

    if (team) {
      pipeline.push({
        $match: {
          team3: { $regex: `^${team}`, $options: 'i' }
        }
      })
    }

    pipeline.push({
      $sort: { statusASC: 1, createdAt: -1 }
    })

    const order = await Distribution.aggregate(pipeline)

    if (order.length == 0) {
      return res
        .status(404)
        .json({ status: 404, message: 'Distribution order not found!' })
    }

    const response = await Promise.all(
      order.map(async o => {
        // ใช้ o.area ในแต่ละรอบ
        const userData = await User.findOne({
          role: 'sale',
          area: o.area // <--- ใช้อันนี้
        })

        return {
          area: o.area,
          sale: userData
            ? {
                fullname: `${userData.firstName} ${userData.surName}`,
                tel: `${userData.tel}`
              }
            : null,
          orderId: o.orderId,
          // orderNo: o.orderNo,
          // highStatus: o.highStatus,
          // lowStatus: o.lowStatus,
          newTrip: o.newTrip,
          withdrawType: o.withdrawType,
          totalWeightGross: o.totalWeightGross,
          totalWeightNet: o.totalWeightNet,
          orderType: o.orderType,
          orderTypeName: o.orderTypeName,
          sendDate: o.sendDate,
          total: o.totalQty || 0,
          status: o.status,
          statusTH: o.statusTH,
          createdAt: o.createdAt,
          formmatDate: formatDateTimeToThai(o.createdAt)
        }
      })
    )

    // const io = getSocket()
    // io.emit('distribution/get', {});

    res.status(200).json({
      status: 200,
      message: 'Successful!',
      data: response
    })
  } catch (error) {
    console.error('Error saving store to MongoDB:', error)
    res.status(500).json({ status: '500', message: 'Server Error' })
  }
}

exports.getOrderSup = async (req, res) => {
  try {
    const { type, area, period, zone, team, year, month, start, end } =
      req.query
    const channel = req.headers['x-channel']

    const { Distribution } = getModelsByChannel(channel, res, distributionModel)
    const { User } = getModelsByChannel(channel, res, userModel)

    // let response = []
    // if (!type) {
    //   return res.status(400).json({ status: 400, message: 'type is required!' })
    // }

    let startDate, endDate

    if (start && end) {
      // ตัด string แล้ว parse เป็น Date
      startDate = new Date(
        start.substring(0, 4), // year: 2025
        parseInt(start.substring(4, 6), 10) - 1, // month: 08 → index 7
        start.substring(6, 8) // day: 01
      )

      endDate = new Date(
        end.substring(0, 4), // year: 2025
        parseInt(end.substring(4, 6), 10) - 1, // month: 08 → index 7
        end.substring(6, 8) // day: 01
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

    let statusQuery = {}
    if (type === 'pending') {
      statusQuery.status = {
        $in: [
          'pending',
          'approved',
          'rejected',
          'success',
          'confirm',
          'supapproved',
          'canceled'
        ]
      }
    } else if (type === 'history') {
      statusQuery.status = {
        $in: ['approved', 'rejected', 'success', 'confirm']
      }
    }

    // const status = type === 'history' ? { $ne: 'pending' } : 'pending'
    let areaQuery = {}

    if (area) {
      areaQuery.area = area
    } else if (zone) {
      areaQuery.area = { $regex: `^${zone}`, $options: 'i' }
    }

    let query = {
      ...areaQuery,
      ...(period ? { period } : {}),
      // withdrawType: { $ne: 'credit' },
      createdAt: { $gte: startDate, $lt: endDate },
      ...statusQuery
    }

    // console.log(query)

    const pipeline = [
      {
        $addFields: {
          team3: {
            $concat: [
              { $substrCP: ['$area', 0, 2] },
              { $substrCP: ['$area', 3, 1] }
            ]
          },
          statusASC: {
            $cond: [
              { $eq: ['$status', 'pending'] },
              0,
              {
                $cond: [
                  { $eq: ['$status', 'approved'] },
                  1,
                  2 // else: rejected (or other status)
                ]
              }
            ]
          }
        }
      },
      { $match: query }
    ]

    if (team) {
      pipeline.push({
        $match: {
          team3: { $regex: `^${team}`, $options: 'i' }
        }
      })
    }

    pipeline.push({
      $sort: { statusASC: 1, createdAt: -1 }
    })

    const order = await Distribution.aggregate(pipeline)

    if (order.length == 0) {
      return res
        .status(404)
        .json({ status: 404, message: 'Distribution order not found!' })
    }

    const response = await Promise.all(
      order.map(async o => {
        // ใช้ o.area ในแต่ละรอบ
        const userData = await User.findOne({
          role: 'sale',
          area: o.area // <--- ใช้อันนี้
        })

        return {
          area: o.area,
          sale: userData
            ? {
                fullname: `${userData.firstName} ${userData.surName}`,
                tel: `${userData.tel}`
              }
            : null,
          orderId: o.orderId,
          newTrip: o.newTrip,
          withdrawType: o.withdrawType,
          totalWeightGross: o.totalWeightGross,
          totalWeightNet: o.totalWeightNet,
          orderType: o.orderType,
          orderTypeName: o.orderTypeName,
          sendDate: o.sendDate,
          total: o.totalQty || 0,
          status: o.status,
          createdAt: o.createdAt,
          formmatDate: formatDateTimeToThai(o.createdAt)
        }
      })
    )

    // const io = getSocket()
    // io.emit('distribution/get', {});

    res.status(200).json({
      status: 200,
      message: 'Successful!',
      data: response
    })
  } catch (error) {
    console.error('Error saving store to MongoDB:', error)
    res.status(500).json({ status: '500', message: 'Server Error' })
  }
}

exports.getDetail = async (req, res) => {
  try {
    const { orderId } = req.params

    const channel = req.headers['x-channel']

    const { Distribution } = getModelsByChannel(channel, res, distributionModel)
    if (!orderId) {
      return res
        .status(400)
        .json({ status: 400, message: 'orderId is required!' })
    }

    const order = await Distribution.find({ orderId })

    if (order.length === 0) {
      return res
        .status(404)
        .json({ status: 404, message: 'Distribution order not found!' })
    }
    const data = order.map(u => {
      return {
        order: u.order,
        type: u.type,
        _id: u._id,
        orderId: u.orderId,
        orderType: u.orderType,
        orderTypeName: u.orderTypeName,
        area: u.area,
        fromWarehouse: u.fromWarehouse,
        toWarehouse: u.toWarehouse,
        shippingId: u.shippingId,
        shippingRoute: u.shippingRoute,
        shippingName: u.shippingName,
        withdrawType: u.withdrawType,
        sendAddress: u.sendAddress,
        sendDate: u.sendDate,
        remark: u.remark,
        remarkWarehouse: u.remarkWarehouse,
        listProduct: u.listProduct.map(p => {
          return {
            id: p.isNPD ? 'xxxxxxxxxx' : p.id,
            name: p.isNPD ? 'สินค้า NPD' : p.name,
            group: p.isNPD ? 'NPD' : p.group,
            brand: p.isNPD ? 'NPD' : p.brand,
            size: p.isNPD ? 'NPD' : p.size,
            flavour: p.isNPD ? 'NPD' : p.flavour,
            qty: p.qty,
            unit: p.unit,
            qtyPcs: p.qtyPcs,
            price: p.price,
            total: p.total,
            weightGross: p.weightGross,
            weightNet: p.weightNet,
            receiveQty: p.receiveQty,
            _id: p._id,
            isNPD: p.isNPD
          }
        }),
        newTrip: u.newTrip,
        total: u.total,
        totalQty: u.totalQty,
        totalWeightGross: u.totalWeightGross,
        totalWeightNet: u.totalWeightNet,
        receivetotal: u.receivetotal,
        receivetotalQty: u.receivetotalQty,
        receivetotalWeightGross: u.receivetotalWeightGross,
        receivetotalWeightNet: u.receivetotalWeightNet,
        status: u.status,
        newTrip: u.newTrip,
        statusTH: u.statusTH,
        createdAt: u.createdAt
      }
    })

    // const io = getSocket()
    // io.emit('distribution/detail', {});

    res.status(200).json({
      status: 200,
      message: 'successful!',
      data: data
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.updateStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body

    const channel = req.headers['x-channel']

    const { Distribution } = getModelsByChannel(channel, res, distributionModel)

    if (!orderId || !status) {
      return res
        .status(400)
        .json({ status: 400, message: 'orderId, status are required!' })
    }

    const order = await Distribution.findOne({ orderId })
    if (!order) {
      return res.status(404).json({ status: 404, message: 'Order not found!' })
    }

    if (order.status !== 'pending' && status !== 'canceled') {
      return res.status(400).json({
        status: 400,
        message: 'Cannot update status, distribution is not in pending state!'
      })
    }

    if (status === 'canceled') {
      statusTH = 'ยกเลิก'
    }

    const updatedOrder = await Distribution.findOneAndUpdate(
      { orderId },
      { $set: { status, statusTH } },
      { new: true }
    )

    const io = getSocket()
    io.emit('distribution/updateStatus', {
      status: 200,
      message: 'Updated status successfully!'
    })

    res.status(200).json({
      status: 200,
      message: 'Updated status successfully!'
    })
  } catch (error) {
    console.error('Error updating order:', error)
    res.status(500).json({ status: 500, message: 'Server error' })
  }
}

exports.updateStockWithdraw = async (req, res) => {
  const { orderId, status } = req.body
  const channel = req.headers['x-channel']
  const { Stock, StockMovementLog, StockMovement } = getModelsByChannel(
    channel,
    res,
    stockModel
  )

  const stockmovements = await StockMovement.findOne({
    orderId: orderId,
    status: status
  })

  const productId = stockmovements.product.flatMap(u => u.productId)

  const stock = await Stock.aggregate([
    { $match: { area: stockmovements.area, period: stockmovements.period } },
    { $unwind: { path: '$listProduct', preserveNullAndEmptyArrays: true } },
    { $match: { 'listProduct.productId': { $in: productId } } },
    // { $match : { "listProduct.available.lot": u.lot } },
    {
      $project: {
        _id: 0,
        productId: '$listProduct.productId',
        sumQtyPcs: '$listProduct.sumQtyPcs',
        sumQtyCtn: '$listProduct.sumQtyCtn',
        sumQtyPcsStockIn: '$listProduct.sumQtyPcsStockIn',
        sumQtyCtnStockIn: '$listProduct.sumQtyCtnStockIn',
        sumQtyPcsStockOut: '$listProduct.sumQtyPcsStockOut',
        sumQtyCtnStockOut: '$listProduct.sumQtyCtnStockOut',
        available: '$listProduct.available'
      }
    }
  ])

  let listProductWithDraw = []
  let updateLot = []

  for (const stockDetail of stock) {
    for (const lot of stockDetail.available) {
      const calDetails = calStock.product.filter(
        u => u.productId === stockDetail.productId && u.lot === lot.lot
      )

      let pcsQty = 0
      let ctnQty = 0

      for (const cal of calDetails) {
        if (cal.unit === 'PCS' || cal.unit === 'BOT') {
          pcsQty += cal.qty || 0
        }
        if (cal.unit === 'CTN') {
          ctnQty += cal.qty || 0
        }
      }
      checkQtyPcs = lot.qtyPcs + pcsQty
      checkQtyCtn = lot.qtyCtn + ctnQty

      updateLot.push({
        productId: stockDetail.productId,
        location: lot.location,
        lot: lot.lot,
        qtyPcs: Math.checkQtyPcs,
        qtyPcsStockIn: lot.qtyPcsStockIn + pcsQty,
        qtyPcsStockOut: lot.qtyPcsStockOut,
        qtyCtn: Math.checkQtyCtn,
        qtyCtnStockIn: lot.qtyCtnStockIn + ctnQty,
        qtyCtnStockOut: lot.qtyCtnStockOut
      })
    }

    const relatedLots = updateLot.filter(
      u => u.productId === stockDetail.productId
    )
    listProductWithDraw.push({
      productId: stockDetail.productId,
      sumQtyPcs: relatedLots.reduce((total, item) => total + item.qtyPcs, 0),
      sumQtyCtn: relatedLots.reduce((total, item) => total + item.qtyCtn, 0),
      sumQtyPcsStockIn: relatedLots.reduce(
        (total, item) => total + item.qtyPcsStockIn,
        0
      ),
      sumQtyCtnStockIn: relatedLots.reduce(
        (total, item) => total + item.qtyCtnStockIn,
        0
      ),
      sumQtyPcsStockOut: relatedLots.reduce(
        (total, item) => total + item.qtyPcsStockOut,
        0
      ),
      sumQtyCtnStockOut: relatedLots.reduce(
        (total, item) => total + item.qtyCtnStockOut,
        0
      ),
      available: relatedLots.map(({ id, ...rest }) => rest)
    })
  }
  // console.log("listProductWithDraw:\n", JSON.stringify(listProductWithDraw, null, 2));
  for (const updated of listProductWithDraw) {
    await Stock.findOneAndUpdate(
      { area: area, period: stockmovements.period },
      {
        $set: {
          'listProduct.$[product].sumQtyPcs': updated.sumQtyPcs,
          'listProduct.$[product].sumQtyCtn': updated.sumQtyCtn,
          'listProduct.$[product].sumQtyPcsStockIn': updated.sumQtyPcsStockIn,
          'listProduct.$[product].sumQtyCtnStockIn': updated.sumQtyCtnStockIn,
          'listProduct.$[product].sumQtyPcsStockOut': updated.sumQtyPcsStockOut,
          'listProduct.$[product].sumQtyCtnStockOut': updated.sumQtyCtnStockOut,
          'listProduct.$[product].available': updated.available
        }
      },
      { arrayFilters: [{ 'product.productId': updated.productId }], new: true }
    )
  }

  const io = getSocket()
  io.emit('distribution/updateStockWithdraw', {})

  res.status(200).json({
    status: 200,
    message: 'successfully',
    stock
  })
}

exports.insertWithdrawToErp = async (req, res) => {
  const { area, period } = req.body
  const channel = req.headers['x-channel']
  const { Distribution } = getModelsByChannel(channel, res, distributionModel)
  const distributionData = await Distribution.find({ area: area })

  let data = []
  for (const item of distributionData) {
    const sendDate = new Date(item.sendDate) // สร้าง Date object
    const formattedDate = sendDate.toISOString().slice(0, 10).replace(/-/g, '') // "20250222"
    const MGNUGL = item.listProduct.map(i => i.id)
    const uniqueCount = new Set(MGNUGL).size

    const dataTran = {
      Hcase: 0,
      orderNo: item.orderId,
      statusLow: '22',
      statusHigh: '22',
      orderType: item.orderType,
      tranferDate: formattedDate,
      warehouse: item.fromWarehouse,
      towarehouse: item.toWarehouse,
      routeCode: item.shippingRoute,
      addressCode: item.shippingId,
      location: '',
      MGNUGL: uniqueCount,
      MGDEPT: '',
      remark: '',
      item: item.listProduct.map(u => {
        return {
          itemCode: u.id,
          itemStatus: '22',
          MRWHLO: item.fromWarehouse,
          itemQty: u.qty,
          itemUnit: u.unit,
          toLocation: '',
          itemLot: '',
          location: '',
          itemLocation: ''
        }
      })
    }
    data.push(dataTran)
  }

  const response = await axios.post(
    `${process.env.API_URL_12ERP}/distribution/insertdistribution`,
    data
  )

  const io = getSocket()
  io.emit('distribution/insertWithdrawToErp', {
    status: 200,
    message: 'successfully',
    data
  })

  res.status(200).json({
    status: 200,
    message: 'successfully',
    data
  })
}

exports.insertOneWithdrawToErp = async (req, res) => {
  const { orderId } = req.body
  const channel = req.headers['x-channel']
  const { Distribution } = getModelsByChannel(channel, res, distributionModel)
  const distributionData = await Distribution.find({ orderId: orderId })

  let data = []
  for (const item of distributionData) {
    const sendDate = new Date(item.sendDate)
    const formattedDate = sendDate.toISOString().slice(0, 10).replace(/-/g, '')
    const MGNUGL = item.listProduct.map(i => i.id)
    const uniqueCount = new Set(MGNUGL).size

    const dataTran = {
      Hcase: 1,
      orderNo: item.orderId,
      statusLow: '22',
      statusHigh: '22',
      orderType: item.orderType,
      tranferDate: formattedDate,
      warehouse: item.fromWarehouse,
      towarehouse: item.toWarehouse,
      routeCode: item.shippingRoute,
      addressCode: item.shippingId,
      location: '',
      MGNUGL: uniqueCount,
      MGDEPT: '',
      remark: '',
      items: item.listProduct.map(u => {
        return {
          itemCode: u.id,
          itemStatus: '22',
          MRWHLO: item.fromWarehouse,
          itemQty: u.qty,
          itemUnit: u.unit,
          toLocation: '',
          itemLot: '',
          location: '',
          itemLocation: ''
        }
      })
    }
    data.push(dataTran)
  }

  const response = await axios.post(
    `${process.env.API_URL_12ERP}/distribution/insertdistribution`,
    data
  )

  const io = getSocket()
  io.emit('distribution/insertOneWithdrawToErp', {
    status: 200,
    message: 'successfully',
    data
  })

  res.status(200).json({
    status: 200,
    message: 'successfully',
    data
  })
}

exports.addFromERPWithdraw = async (req, res) => {
  const channel = req.headers['x-channel']

  const { Withdraw } = getModelsByChannel(channel, res, distributionModel)
  const result = await withdrawQuery(channel)
  // console.log(result)
  for (const item of result) {
    const existWithdraw = await Withdraw.findOne({ Des_No: item.Des_No })
    if (existWithdraw) {
      await Withdraw.findOneAndUpdate({ Des_No: item.Des_No }, item, {
        new: true
      })
    } else {
      await Withdraw.create(item)
    }
  }

  const io = getSocket()
  io.emit('distribution/addFromERPWithdraw', {})

  res.status(200).json({
    status: 200,
    message: 'successfully',
    data: result
  })
}

exports.addOneWithdraw = async (req, res) => {
  const channel = req.headers['x-channel']
  const {
    Des_No,
    Des_Name,
    Des_Date,
    Des_Area,
    ZType,
    WH,
    ROUTE,
    WH1,
    Dc_Email
  } = req.body
  const { Withdraw } = getModelsByChannel(channel, res, distributionModel)

  const data = {
    Des_No: Des_No,
    Des_Name: Des_Name,
    Des_Date: Des_Date,
    Des_Area: Des_Area,
    ZType: ZType,
    WH: WH,
    ROUTE: ROUTE,
    WH1: WH1,
    Dc_Email: Dc_Email
  }
  await Withdraw.create(data)

  const io = getSocket()
  io.emit('distribution/addOneWithdraw', {})

  res.status(200).json({
    status: 200,
    message: 'successfully',
    data: data
  })
}

exports.cancelWithdraw = async (req, res) => {
  try {
    const { orderId, user, role } = req.body
    const channel = req.headers['x-channel']
    const { ApproveLogs } = getModelsByChannel(channel, res, approveLogModel)
    const { Distribution } = getModelsByChannel(channel, res, distributionModel)

    const distributionTran = await Distribution.findOne({
      orderId: orderId,
      type: 'withdraw'
    })

    if (!distributionTran) {
      return res
        .status(404)
        .json({ status: 404, message: 'Not found withdraw' })
    }

    const io = getSocket()
    io.emit('distribution/cancelWithdraw', {
      status: 200,
      message: 'successfully',
      data: distributionTran
    })

    const distributionData = await Distribution.findOneAndUpdate(
      { orderId: orderId, type: 'withdraw' },
      {
        $push: {
          approve: {
            dateSend: new Date(), // หรือจะไม่ใส่ก็ได้ถ้ามี default
            dateAction: new Date(),
            role: role,
            appPerson: user,
            status: 'canceled'
          }
        },
        $set: {
          statusTH: 'ยกเลิก',
          status: 'canceled'
        }
      },
      { new: true }
    )

    await ApproveLogs.create({
      module: 'cancelWithdraw',
      user: user,
      status: 'canceled',
      id: orderId
    })

    res.status(200).json({
      status: 200,
      message: 'successfully',
      data: 'canceled'
    })
  } catch (error) {
    console.error('[❌ saleConfirmWithdraw ERROR]', error)
    return res.status(500).json({
      status: 500,
      message: error.message || 'Internal server error'
    })
  }
}

exports.approveWithdraw = async (req, res) => {
  try {
    const { orderId, status, user, role } = req.body
    let statusStr = status === true ? 'approved' : 'rejected'
    let statusThStr = status === true ? 'อนุมัติ' : 'ไม่อนุมัติ'

    const channel = req.headers['x-channel']
    const { Distribution, WereHouse } = getModelsByChannel(
      channel,
      res,
      distributionModel
    )
    const { ApproveLogs } = getModelsByChannel(channel, res, approveLogModel)
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Stock, StockMovementLog, StockMovement } = getModelsByChannel(
      channel,
      res,
      stockModel
    )
    const { Option } = getModelsByChannel(channel, res, optionsModel)
    const { Npd } = getModelsByChannel(channel, res, npdModel)
    const { User } = getModelsByChannel(channel, res, userModel)
    const { Withdraw } = getModelsByChannel(channel, res, DistributionModel)

    if (statusStr === 'approved') {
      // console.log(orderId)
      const distributionTran = await Distribution.findOne({
        orderId: orderId,
        type: 'withdraw'
      })
      if (!distributionTran) {
        return res
          .status(404)
          .json({ status: 404, message: 'Not found withdraw' })
      }

      if (!distributionTran.period) {
        return res
          .status(404)
          .json({ status: 404, message: 'Not found period in doc' })
      }

      const sendDate = new Date(distributionTran.sendDate)
      const formattedDate = sendDate
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, '')
      const MGNUGL = distributionTran.listProduct.map(i => i.id)
      const uniqueCount = new Set(MGNUGL).size
      let data = []
      dataTran = {
        Hcase: 1,
        orderNo: distributionTran.orderId,
        statusLow: '22',
        statusHigh: '22',
        orderType: distributionTran.orderType,
        tranferDate: formattedDate,
        warehouse: distributionTran.fromWarehouse,
        towarehouse: distributionTran.toWarehouse,
        routeCode: distributionTran.shippingRoute,
        addressCode: distributionTran.shippingId,
        location: '',
        MGNUGL: uniqueCount,
        MGDEPT: '',
        remark: '',
        items: distributionTran.listProduct.map(u => ({
          itemCode: u.id,
          itemStatus: '22',
          MRWHLO: distributionTran.fromWarehouse,
          itemQtyCTN: u.qty,
          itemQty: u.qtyPcs,
          itemUnit: u.unit,
          toLocation: '',
          itemLot: '',
          location: '',
          itemLocation: ''
        }))
      }
      data.push(dataTran)
      if (distributionTran.area != 'IT211') {
        let response
        try {
          if (distributionTran.withdrawType != 'credit') {
            response = await axios.post(
              `${process.env.API_URL_12ERP}/distribution/insertdistribution`,
              data
            )
          }
        } catch (err) {
          if (err.response) {
            console.log('API error response:', err.response.data)
            console.log('Status:', err.response.status)
            return res.status(500).json({
              status: 500,
              message: 'External API failed',
              error: err.response.data // <-- error ที่มาจากปลายทางจริง
            })
          } else if (err.request) {
            console.log('No response from API:', err.message)
            return res.status(500).json({
              status: 500,
              message: 'External API unreachable',
              error: err.message
            })
          } else {
            console.log('Other error:', err.message)
            return res.status(500).json({
              status: 500,
              message: 'External API error',
              error: err.message
            })
          }
        }
      }

      const withdrawType = await Option.findOne({ module: 'withdraw' })
      const withdrawTypeTh = withdrawType.list.find(
        item => item.value === distributionTran.withdrawType
      ).name
      // console.log(withdrawTypeTh)
      const userData = await User.findOne({
        role: 'sale',
        area: distributionTran.area
      })
      const email = await Withdraw.findOne({
        ROUTE: distributionTran.shippingRoute,
        Des_No: distributionTran.shippingId
      }).select('Dc_Email Des_Name')
      const wereHouseName = await WereHouse.findOne({
        wh_code: distributionTran.fromWarehouse
      }).select('wh_name')

      if (distributionTran.area != 'IT211') {
        if (process.env.CA_DB_URI === process.env.UAT_CHECK) {
          sendEmail({
            to: email.Dc_Email,
            // cc: [process.env.BELL_MAIL, process.env.BANK_MAIL],
            cc: process.env.IT_MAIL,
            subject: `${distributionTran.orderId} 12App cash`,
            html: `
          <h1>แจ้งการส่งใบขอเบิกผ่านทางอีเมล</h1>
          <p>
            <strong>ประเภทการเบิก:</strong> ${withdrawTypeTh}<br> 
            <strong>เลขที่ใบเบิก:</strong> ${distributionTran.orderId}<br>
            <strong>ประเภทการจัดส่ง:</strong> ${
              distributionTran.orderTypeName
            }<br>
            <strong>จัดส่ง:</strong> ${distributionTran.fromWarehouse}${
              '-' + wereHouseName?.wh_name || ''
            }<br>
            <strong>สถานที่จัดส่ง:</strong> ${distributionTran.toWarehouse}-${
              distributionTran.shippingName
            }<br>
            <strong>วันที่จัดส่ง:</strong> ${distributionTran.sendDate}<br>
            <strong>เขต:</strong> ${distributionTran.area}<br>
            <strong>ชื่อ:</strong> ${userData.firstName} ${userData.surName}<br>
            <strong>เบอร์โทรศัพท์เซลล์:</strong> ${userData.tel}<br>
            <strong>หมายเหตุ:</strong> ${distributionTran.remark}
          </p>
        `
          })
        }
      }

      const io = getSocket()
      io.emit('distribution/approveWithdraw', {
        status: 200,
        message: 'successfully',
        data: dataTran
      })

      const distributionData = await Distribution.findOneAndUpdate(
        { orderId: orderId, type: 'withdraw' },
        {
          $push: {
            approve: {
              dateSend: new Date(), // หรือจะไม่ใส่ก็ได้ถ้ามี default
              dateAction: new Date(),
              role: role,
              appPerson: user,
              status: statusStr
            }
          },
          $set: {
            statusTH: statusThStr,
            status: statusStr
          }
        },
        { new: true }
      )

      const productQty = distributionData.listProduct.map(u => {
        return {
          id: u.id,
          // lot: u.lot,
          unit: u.unit,
          qty: u.qty,
          statusMovement: 'OUT'
        }
      })

      const calStock = {
        // storeId: refundOrder.store.storeId,
        orderId: distributionData.orderId,
        area: distributionData.area,
        // saleCode: sale.saleCode,
        period: distributionData.period,
        warehouse: distributionData.fromWarehouse,
        status: statusStr,
        statusTH: statusThStr,
        action: 'Withdraw',
        type: 'Withdraw',
        product: productQty
      }

      const createdMovement = await StockMovement.create({
        ...calStock
      })

      await StockMovementLog.create({
        ...calStock,
        refOrderId: createdMovement._id
      })

      await ApproveLogs.create({
        module: 'approveWithdraw',
        user: user,
        status: statusStr,
        id: orderId
      })

      res.status(200).json({
        status: 200,
        message: 'successfully',
        data: dataTran
      })
    } else {
      const distributionData = await Distribution.findOneAndUpdate(
        { orderId: orderId, type: 'withdraw' },
        {
          $push: {
            approve: {
              dateSend: new Date(), // หรือจะไม่ใส่ก็ได้ถ้ามี default
              dateAction: new Date(),
              role: role,
              appPerson: user,
              status: statusStr
            }
          },
          $set: {
            statusTH: statusThStr,
            status: statusStr
          }
        },
        { new: true }
      )

      if (distributionData.newTrip === 'true') {
        await Npd.findOneAndUpdate(
          { area: distributionData.area, period: distributionData.period },
          {
            $set: {
              isReceived: 'false'
            }
          }
        )
      }

      const productQty = distributionData.listProduct.map(u => {
        return {
          id: u.id,
          // lot: u.lot,
          unit: u.unit,
          qty: u.qty,
          statusMovement: 'OUT'
        }
      })

      const calStock = {
        // storeId: refundOrder.store.storeId,
        orderId: distributionData.orderId,
        area: distributionData.area,
        // saleCode: sale.saleCode,
        period: distributionData.period,
        warehouse: distributionData.fromWarehouse,
        status: statusStr,
        statusTH: statusThStr,
        action: 'Withdraw',
        type: 'Withdraw',
        product: productQty
      }

      const createdMovement = await StockMovement.create({
        ...calStock
      })

      await StockMovementLog.create({
        ...calStock,
        refOrderId: createdMovement._id
      })

      await ApproveLogs.create({
        module: 'approveWithdraw',
        user: user,
        status: statusStr,
        id: orderId
      })

      res.status(200).json({
        status: 200,
        message: 'successfully',
        data: statusStr
      })
    }
  } catch (error) {
    console.error('[❌ approveWithdraw ERROR ', error) // แสดงใน console
    res.status(500).json({
      status: 500,
      message: error.message,
      stack: error.stack // เพิ่มเพื่อ debug ลึกขึ้น (optional)
    })
  }
}

exports.approveWithdrawCredit = async (req, res) => {
  try {
    const { orderId, status, user, role } = req.body

    const channel = req.headers['x-channel']

    const { ApproveLogs } = getModelsByChannel(channel, res, approveLogModel)
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Stock } = getModelsByChannel(channel, res, stockModel)
    const { Option } = getModelsByChannel(channel, res, optionsModel)
    const { Npd } = getModelsByChannel(channel, res, npdModel)
    const { User } = getModelsByChannel(channel, res, userModel)
    const { Distribution, WereHouse, Withdraw } = getModelsByChannel(
      channel,
      res,
      distributionModel
    )

    let statusTH

    if (!orderId || !status) {
      return res
        .status(400)
        .json({ status: 400, message: 'orderId, status are required!' })
    }

    const distributionTran = await Distribution.findOne({ orderId })
    if (!distributionTran) {
      return res
        .status(404)
        .json({ status: 404, message: 'Distribution not found!' })
    }

    if (distributionTran.withdrawType != 'credit') {
      return res
        .status(401)
        .json({ status: 404, message: 'Distribution is not credit!' })
    }

    if (status === 'approved') {
      statusTH = 'อนุมัติ'
    } else if (status === 'rejected') {
      statusTH = 'ไม่อนุมัติ'
    } else if (status === 'supapproved') {
      statusTH = 'ซุปอนุมัติ'

      const withdrawType = await Option.findOne({ module: 'withdraw' })
      const withdrawTypeTh = withdrawType.list.find(
        item => item.value === distributionTran.withdrawType
      ).name
      const userData = await User.findOne({
        role: 'sale',
        area: distributionTran.area
      })
      const email = await Withdraw.findOne({
        ROUTE: distributionTran.shippingRoute,
        Des_No: distributionTran.shippingId
      }).select('Dc_Email Des_Name')
      const wereHouseName = await WereHouse.findOne({
        wh_code: distributionTran.fromWarehouse
      }).select('wh_name')

      if (distributionTran.area != 'IT211') {
        if (process.env.CA_DB_URI === process.env.UAT_CHECK) {
          sendEmail({
            to: email.Dc_Email,
            // cc: [process.env.BELL_MAIL, process.env.BANK_MAIL],
            cc: process.env.IT_MAIL,
            subject: `${distributionTran.orderId} 12App cash`,
            html: `
          <h1>แจ้งการส่งใบขอเบิกผ่านทางอีเมล</h1>
          <p>
            <strong>ประเภทการเบิก:</strong> ${withdrawTypeTh}<br> 
            <strong>เลขที่ใบเบิก:</strong> ${distributionTran.orderId}<br>
            <strong>ประเภทการจัดส่ง:</strong> ${
              distributionTran.orderTypeName
            }<br>
            <strong>จัดส่ง:</strong> ${distributionTran.fromWarehouse}${
              '-' + wereHouseName?.wh_name || ''
            }<br>
            <strong>สถานที่จัดส่ง:</strong> ${distributionTran.toWarehouse}-${
              distributionTran.shippingName
            }<br>
            <strong>วันที่จัดส่ง:</strong> ${distributionTran.sendDate}<br>
            <strong>เขต:</strong> ${distributionTran.area}<br>
            <strong>ชื่อ:</strong> ${userData.firstName} ${userData.surName}<br>
            <strong>เบอร์โทรศัพท์เซลล์:</strong> ${userData.tel}<br>
            <strong>หมายเหตุ:</strong> ${distributionTran.remark}
          </p>
        `
          })
        }
      }
    }

    const distributionData = await Distribution.findOneAndUpdate(
      { orderId: orderId, type: 'withdraw' },
      {
        $push: {
          approve: {
            dateSend: new Date(), // หรือจะไม่ใส่ก็ได้ถ้ามี default
            dateAction: new Date(),
            role: role,
            appPerson: user,
            status: status
          }
        },
        $set: {
          statusTH: statusTH,
          status: status
        }
      },
      { new: true }
    )

    await ApproveLogs.create({
      module: 'approveWithdraw',
      user: user,
      status: status,
      id: orderId
    })

    const io = getSocket()
    io.emit('distribution/approveWithdrawCredit', {
      status: 200,
      message: 'Updated status successfully!'
    })

    res.status(200).json({
      status: 200,
      message: 'Updated status successfully!'
    })
  } catch (error) {
    console.error('Error updating order:', error)
    res.status(500).json({ status: 500, message: 'Server error' })
  }
}

const withdrawUpdateTimestamps = {}

exports.saleConfirmWithdraw = async (req, res) => {
  try {
    const { orderId, status, user } = req.body

    // ✅ ตรวจสอบ input
    if (!orderId || typeof status !== 'boolean') {
      return res.status(400).json({
        status: 400,
        message: 'Invalid request: orderId and status(boolean) are required.'
      })
    }

    const channel = req.headers['x-channel']
    const { Distribution } = getModelsByChannel(channel, res, distributionModel)
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { ApproveLogs } = getModelsByChannel(channel, res, approveLogModel)
    const { Stock, StockMovementLog, StockMovement } = getModelsByChannel(
      channel,
      res,
      stockModel
    )
    // ===== debounce ตรงนี้ =====
    const now = Date.now()
    const lastUpdate = withdrawUpdateTimestamps[orderId] || 0
    const ONE_MINUTE = 60 * 1000

    if (now - lastUpdate < ONE_MINUTE) {
      return res.status(429).json({
        status: 429,
        message:
          'This order was updated less than 1 minute ago. Please try again later!'
      })
    }
    withdrawUpdateTimestamps[orderId] = now
    // ===== end debounce =====

    // กรณี status === true
    if (status === true) {
      const distributionTran = await Distribution.findOne({
        orderId,
        type: 'withdraw'
      })

      if (!distributionTran) {
        return res
          .status(404)
          .json({ status: 404, message: 'Withdraw transaction not found.' })
      }

      // ✅ ดึงข้อมูลสินค้าที่เกี่ยวข้อง
      const listProductId = distributionTran.listProduct
        .map(i => i.id)
        .filter(Boolean)

      productDetail = await Product.find({ id: { $in: listProductId } })

      if (
        !Array.isArray(distributionTran.listProduct) ||
        distributionTran.listProduct.length === 0
      ) {
        return res.status(400).json({
          status: 400,
          message: 'No products found in withdrawal transaction.'
        })
      }

      const receiveQtyZero = []

      for (item of distributionTran.listProduct) {
        if (item.receiveQty === 0 && item.receiveUnit == '') {
          receiveQtyZero.push(item.id)
        }
      }

      // console.log(receiveQtyZero)]

      if (distributionTran.withdrawType === 'credit') {
        distributionTran.listProduct.forEach(item => {
          item.receiveQty = item.qty // เพิ่มหรือทับ field ใน object เดิม
          item.receiveUnit = item.unit
        })

        receivetotal = distributionTran.total
        receivetotalQty = distributionTran.totalQty
        receivetotalWeightGross = distributionTran.totalWeightGross
        receivetotalWeightNet = distributionTran.totalWeightNet

        // console.log(distributionTran.listProduct)
      } else {
        const row = await DisributionM3.findOne({ where: { coNo: orderId } })
        if (!row)
          return res
            .status(404)
            .json({ status: 404, message: `${orderId} not found in M3` })

        const checkStatus = await MGLINE.findAll({
          where: {
            MRCONO: 410,
            MRTRNR: orderId,
            MRTRSH: '99'
          },
          raw: true
        })

        const productIds = checkStatus.flatMap(item => item.MRITNO)

        // ✅ ดึงข้อมูลรับสินค้าจากระบบ ERP
        const Receive = await MHDISL.findAll({
          where: {
            coNo: orderId,
            productId: { [Op.in]: productIds }
          },
          raw: true
        })
        const ReceiveWeight = await MHDISH.findAll({
          where: { coNo: orderId },
          raw: true
        })
        // console.log(Receive.length)
        const ReceiveQty = Object.values(
          Receive.reduce((acc, cur) => {
            // ใช้ key จาก coNo + withdrawUnit + productId (ถ้าอยากแยกตาม productId ด้วย)
            const key = `${cur.coNo}_${
              cur.withdrawUnit
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

        receivetotalQty = 0
        receivetotal = 0

        for (const i of distributionTran.listProduct) {
          const productIdTrimmed = String(i.id || '').trim()
          const match = ReceiveQty.find(
            r => String(r.productId || '').trim() === productIdTrimmed
          )
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

            if (!unitFactor || !unitFactor.factor || unitFactor.factor === 0) {
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
      }

      const qtyproduct = []

      for (const i of receiveQtyZero ?? []) {
        const productQty = distributionTran.listProduct.find(
          item => item.id === i
        )
        if (productQty.receiveQty === 0) {
          continue
        }

        const unit = (productQty.receiveUnit ?? '').trim()
        const qty = Number(productQty.receiveQty)

        qtyproduct.push({ id: productQty.id, unit, qty })
      }

      receivetotalWeightGross = 0
      receivetotalWeightNet = 0

      for (const item of qtyproduct) {
        // console.log(item)

        const productData = productDetail.find(o => o.id === item.id)
        const weightGross = productData.weightGross * item.qty
        const weightNet = productData.weightNet * item.qty

        receivetotalWeightGross += weightGross
        receivetotalWeightNet += weightNet
        const updateResult = await updateStockMongo(
          item,
          distributionTran.area,
          distributionTran.period,
          'withdraw',
          channel,
          res
        )
        if (updateResult) return
      }

      await Distribution.updateOne(
        { _id: distributionTran._id },
        { $set: { listProduct: distributionTran.listProduct } }
      )

      const distributionData = await Distribution.findOneAndUpdate(
        { orderId, type: 'withdraw' },
        {
          $set: {
            statusTH: 'รับสินค้าสำเร็จ',
            status: 'confirm',
            receivetotal: receivetotal,
            receivetotalQty: receivetotalQty,
            receivetotalWeightGross: receivetotalWeightGross,
            receivetotalWeightNet: receivetotalWeightNet
          }
        },
        { new: true }
      )

      // ✅ ส่ง socket แจ้งผล
      const io = getSocket()
      io.emit('distribution/saleConfirmWithdraw', {
        status: 200,
        message: 'Confirm withdraw success'
      })

      const productQty = distributionData.listProduct.map(u => {
        return {
          id: u.id,
          // lot: u.lot,
          unit: u.receiveUnit,
          qty: u.receiveQty,
          statusMovement: 'OUT'
        }
      })

      const calStock = {
        // storeId: refundOrder.store.storeId,
        orderId: distributionData.orderId,
        area: distributionData.area,
        // saleCode: sale.saleCode,
        period: distributionData.period,
        warehouse: distributionData.fromWarehouse,
        status: 'confirm',
        statusTH: 'รับสินค้าสำเร็จ',
        action: 'Withdraw',
        type: 'Withdraw',
        product: productQty
      }

      const createdMovement = await StockMovement.create({
        ...calStock
      })

      await StockMovementLog.create({
        ...calStock,
        refOrderId: createdMovement._id
      })

      await ApproveLogs.create({
        module: 'saleConfirmWithdraw',
        user: user,
        status: 'confirm',
        id: orderId
      })

      return res.status(200).json({
        status: 200,
        message: 'Confirm withdraw success'
      })
    }

    // ✅ กรณี status === false
    if (status === false) {
      return res.status(200).json({
        status: 200,
        message: 'The withdrawal request has been rejected'
      })
    }
  } catch (error) {
    console.error('[❌ saleConfirmWithdraw ERROR]', error)
    return res.status(500).json({
      status: 500,
      message: error.message || 'Internal server error'
    })
  }
}

exports.getReceiveQty = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { Distribution } = getModelsByChannel(channel, res, distributionModel)
    const { Product } = getModelsByChannel(channel, res, productModel)

    const { orderId } = req.body

    // ✅ ตรวจสอบ input
    if (!orderId) {
      return res.status(400).json({
        status: 400,
        message: 'Invalid request: orderId are required.'
      })
    }

    const distributionTran = await Distribution.findOne({
      orderId,
      type: 'withdraw'
    })

    if (!distributionTran) {
      return res
        .status(404)
        .json({ status: 404, message: 'Withdraw transaction not found.' })
    }

    if (
      !Array.isArray(distributionTran.listProduct) ||
      distributionTran.listProduct.length === 0
    ) {
      return res.status(400).json({
        status: 400,
        message: 'No products found in withdrawal transaction.'
      })
    }

    const row = await DisributionM3.findOne({ where: { coNo: orderId } })
    if (!row)
      return res
        .status(404)
        .json({ status: 404, message: `${orderId} not found in M3` })

    // const toNum = v => Number(String(v ?? '').trim()) // แปลง NVARCHAR -> Number, ตัดช่องว่าง
    // const MGTRSL = toNum(row.MGTRSL)
    // const MGTRSH = toNum(row.MGTRSH)

    // // ถ้าต้องการให้ "ทั้งสองค่า" ต้องเป็น 99 ถึงจะผ่าน
    // if (MGTRSL !== 99 || MGTRSH !== 99) {
    //   return res.status(400).json({
    //     status: 400,
    //     message: `Sucess`,
    //     data: {
    //       orderId: orderId,
    //       lowStatus: row.MGTRSL,
    //       highStatus: row.MGTRSH
    //     }
    //   })
    // }

    const listProductId = distributionTran.listProduct
      .map(i => i.id)
      .filter(Boolean)
    const productDetail = await Product.find({ id: { $in: listProductId } })

    // ✅ ดึงข้อมูลรับสินค้าจากระบบ ERP
    const checkStatus = await MGLINE.findAll({
      where: {
        MRCONO: 410,
        MRTRNR: orderId,
        MRTRSH: '99'
      },
      raw: true
    })

    const productIds = checkStatus.flatMap(item => item.MRITNO)

    // ✅ ดึงข้อมูลรับสินค้าจากระบบ ERP
    const Receive = await MHDISL.findAll({
      where: {
        coNo: orderId,
        productId: { [Op.in]: productIds }
      },
      raw: true
    })

    const ReceiveWeight = await MHDISH.findAll({
      where: { coNo: orderId },
      raw: true
    })

    const ReceiveQty = Object.values(
      Receive.reduce((acc, cur) => {
        // ใช้ key จาก coNo + withdrawUnit + productId (ถ้าอยากแยกตาม productId ด้วย)
        const key = `${cur.coNo}_${cur.withdrawUnit}_${cur.productId.trim()}`
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

    // console.log('merged', merged)
    let receivetotalQty = 0
    let receivetotal = 0

    for (const i of distributionTran.listProduct) {
      const productIdTrimmed = String(i.id || '').trim()
      const match = ReceiveQty.find(
        r => String(r.productId || '').trim() === productIdTrimmed
      )
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

        if (!unitFactor || !unitFactor.factor || unitFactor.factor === 0) {
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

    const lowStatus = row.MGTRSL
    const highStatus = row.MGTRSH

    let statusStr = ''
    let statusThStr = ''

    if (lowStatus == '99') {
      statusStr = 'approved'
      statusThStr = 'กรุณากดรับสินค้า'
    } else if (highStatus == '99') {
      statusStr = 'onprocess'
      statusThStr = 'รอศูนย์ดำเนินการ'
    } else {
      statusStr = 'onprocess'
      statusThStr = 'รอศูนย์ดำเนินการ'
    }

    if (distributionTran.status !== 'confirm') {
      await Distribution.updateOne(
        { orderId: orderId }, // filter: เงื่อนไขในการหา document
        {
          $set: {
            status: statusStr,
            statusTH: statusThStr
          }
        }
      )
    }

    res.status(200).json({
      status: 200,
      message: `Sucess`,
      data: {
        orderId: orderId,
        lowStatus: lowStatus,
        highStatus: highStatus,
        listProduct: distributionTran.listProduct
      }
    })
  } catch (error) {
    console.error('[❌ saleConfirmWithdraw ERROR]', error)
    return res.status(500).json({
      status: 500,
      message: error.message || 'Internal server error'
    })
  }
}

exports.withdrawToExcel = async (req, res) => {
  try {
    const { channel } = req.query
    let { startDate, endDate } = req.query
    let statusArray = (req.query.status || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    if (statusArray.length === 0) {
      statusArray = ['pending'] // default
    }
    const { Withdraw } = getModelsByChannel(channel, res, distributionModel)
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
    const modelWithdraw = await Withdraw.aggregate([
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
          type: { $in: ['withdraw'] },
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
      },
      {
        $sort: { createdAt: 1, orderId: 1 } // เรียงจากน้อยไปมาก (ASC) ถ้าอยากให้ใหม่สุดอยู่บน ใช้ -1
      }
    ])

    const tranFromOrder = modelWithdraw.flatMap(order => {
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
          weightGross: product.weightGross,
          weightNet: product.weightNet,
          receiveQty: product.receiveQty
        }
      })

      const productIDS = [...listProduct].flat()

      // console.log("productIDS",productIDS)
      return productIDS.map(product => {
        counterOrder++

        // const promoCount = 0; // สามารถเปลี่ยนเป็นตัวเลขอื่นเพื่อทดสอบ

        return {
          order: order.orderId,
          type: order.orderType,
          itemNo: product.id,
          name: product.name,
          withdraw: order.store.storeId,
          receiveQty: order.store.storeId,
          toWarehouse: order.store.storeId,
          warehouse: order.store.storeId,
          gross: order.store.storeId,
          net: order.store.storeId,
          OBSPUN: product.unit,
          remark: order.store.storeId
        }
      })
    })
    const allTransactions = [...tranFromOrder]

    const wb = xlsx.utils.book_new()
    const ws = xlsx.utils.json_to_sheet(allTransactions)
    xlsx.utils.book_append_sheet(
      wb,
      ws,
      `ESP${yyyymmddToDdMmYyyy(startDate)}_${yyyymmddToDdMmYyyy(endDate)}`
    )

    const tempPath = path.join(
      os.tmpdir(),
      `WITHDRAW_${yyyymmddToDdMmYyyy(startDate)}_${yyyymmddToDdMmYyyy(
        endDate
      )}.xlsx`
    )
    xlsx.writeFile(wb, tempPath)

    res.download(
      tempPath,
      `WITHDRAW_${yyyymmddToDdMmYyyy(startDate)}_${yyyymmddToDdMmYyyy(
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
        fs.unlink(tempPath, () => {})
      }
    )
  } catch (error) {
    console.error('Error uploading images:', error)
    res
      .status(500)
      .json({ status: 500, message: 'Server error', error: error.message })
  }
}

exports.updateReciveFix = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { period, orderId } = req.body
    const { Distribution } = getModelsByChannel(channel, res, distributionModel)
    const { Product } = getModelsByChannel(channel, res, productModel)

    const withdrawFix = await Distribution.find({ period })
    // console.log(withdrawFix)

    for (const order of withdrawFix) {
      // const distributionTran = await Distribution.findOne({
      //   orderId: order.orderId,
      //   type: 'withdraw'
      // })

      const checkStatus = await MGLINE.findAll({
        where: {
          MRCONO: 410,
          MRTRNR: order.orderId,
          MRTRSH: '99'
        },
        raw: true
      })
      const productIds = checkStatus.flatMap(item => item.MRITNO)

      // ✅ ดึงข้อมูลรับสินค้าจากระบบ ERP
      const Receive = await MHDISL.findAll({
        where: {
          coNo: order.orderId,
          productId: { [Op.in]: productIds }
        },
        raw: true
      })

      const ReceiveWeight = await MHDISH.findAll({
        where: { coNo: order.orderId },
        raw: true
      })

      const ReceiveQty = Object.values(
        Receive.reduce((acc, cur) => {
          // ใช้ key จาก coNo + withdrawUnit + productId (ถ้าอยากแยกตาม productId ด้วย)
          const key = `${cur.coNo}_${cur.withdrawUnit}_${cur.productId.trim()}`
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

      // console.log('merged', merged)
      let receivetotalQty = 0
      let receivetotal = 0

      for (const i of order.listProduct) {
        const productIdTrimmed = String(i.id || '').trim()
        const match = ReceiveQty.find(
          r => String(r.productId || '').trim() === productIdTrimmed
        )
        if (match) {
          const listProductId = order.listProduct.map(i => i.id).filter(Boolean)

          const productDetail = await Product.find({
            id: { $in: listProductId }
          })

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

          if (!unitFactor || !unitFactor.factor || unitFactor.factor === 0) {
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
      receivetotalWeightGross = ReceiveWeight?.[0]?.weightGross || 0
      receivetotalWeightNet = ReceiveWeight?.[0]?.weightNet || 0
      // console.log(order.listProduct)

      await Distribution.updateOne(
        { orderId: order.orderId },
        { $set: { listProduct: order.listProduct } }
      )
    }
    res.status(200).json({
      status: 200,
      message: `Sucess`
      // data: {
      //   orderId: orderId,
      //   lowStatus: row.MGTRSL,
      //   highStatus: row.MGTRSH,
      //   listProduct: distributionTran.listProduct
      // }
    })
  } catch (error) {
    console.error('Error uploading images:', error)
    res
      .status(500)
      .json({ status: 500, message: 'Server error', error: error.message })
  }
}

exports.withdrawBackOrderToExcel = async (req, res) => {
  const { excel, period } = req.query

  const channel = req.headers['x-channel']
  const { Distribution } = getModelsByChannel(channel, res, distributionModel)

  const dataDist = await Distribution.find({
    status: 'confirm',
    area: { $ne: 'IT211' },
    period: period
  }).sort({ createdAt: 1 })

  let dataExcel = []
  for (const item of dataDist) {
    for (const product of item.listProduct) {
      const diff = product.qty - product.receiveQty
      // แปลง createdAt เป็น UTC+7 และ format วันที่ไทย
      const createdAtUtc = new Date(item.createdAt)
      createdAtUtc.setHours(createdAtUtc.getHours() + 7)
      const createdthaiDay = createdAtUtc.getDate()
      const createdthaiMonth = createdAtUtc.getMonth() + 1
      const createdthaiYear = createdAtUtc.getFullYear() + 543
      const createdAtThai = `${createdthaiDay}/${createdthaiMonth}/${createdthaiYear}`

      // คำนวณระยะห่างเป็นวัน
      const created = new Date(item.createdAt)
      const sendDate = new Date(item.sendDate)
      const diffMs = sendDate - created
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

      const data = {
        เลขที่เอกสาร: item.orderId,
        เขตการขาย: item.area,
        วันที่เบิก: createdAtThai,
        ระยะเวลาเบิก: diffDays,
        รหัสสินค้า: product.id,
        ชื่อสินค้า: product.name,
        เบิก: product.qty,
        ได้รับ: product.receiveQty == 0 ? '-' : product.receiveQty,
        ไม่ได้รับ: diff,
        มูลค่าที่ไม่ได้รับ: (diff * product.price).toLocaleString()
      }
      dataExcel.push(data)
    }
  }

  if (!excel) {
    res.status(200).json({
      status: 200,
      message: 'sucess',
      data: dataExcel
    })
  } else {
    const wb = xlsx.utils.book_new()
    const ws = xlsx.utils.json_to_sheet(dataExcel)
    xlsx.utils.book_append_sheet(wb, ws, `backOrder`)

    const tempPath = path.join(os.tmpdir(), `backOrder.xlsx`)
    xlsx.writeFile(wb, tempPath)

    res.download(tempPath, `backOrder.xlsx`, err => {
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
  }
}

exports.withdrawUpdateMGTRDT = async (req, res) => {
  const channel = req.headers['x-channel']
  const { Distribution } = getModelsByChannel(channel, res, distributionModel)

  const withdrawData = await Distribution.find({
    status: ['approved', 'confirm']
  })

  const withdrawTran = withdrawData.map(item => {
    createdAtThai = toThaiTime(item.createdAt)
    return {
      orderId: item.orderId,
      createdAt: item.createdAt,
      createdAtThai: createdAtThai,
      MGTRDT_NEW: formatDateToYYYYMMDD(createdAtThai)
    }
  })

  let m3 = []

  for (i of withdrawTran) {
    const row = await DisributionM3.findOne({ where: { coNo: i.orderId } })

    if (row) {
      row.MGTRDT = i.MGTRDT_NEW
      await row.save() // บันทึกการเปลี่ยนแปลง
      m3.push(row)
    }
  }

  res.status(200).json({
    status: 200,
    message: 'Update Sucess',
    data: withdrawTran
  })
}

exports.withdrawCheckM3 = async (req, res) => {
  const channel = req.headers['x-channel']
  const { Distribution } = getModelsByChannel(channel, res, distributionModel)

  const withdrawData = await Distribution.find({
    status: ['approved', 'confirm'],
    withdrawType: { $ne: 'credit' },
    area: { $ne: 'IT211' }
  })

  const withdrawTran = withdrawData.map(item => {
    createdAtThai = toThaiTime(item.createdAt)
    return {
      orderId: item.orderId,
      createdAt: item.createdAt,
      createdAtThai: createdAtThai,
      MGTRDT_NEW: formatDateToYYYYMMDD(createdAtThai)
    }
  })

  let NotInM3 = []

  for (i of withdrawTran) {
    const row = await DisributionM3.findOne({ where: { coNo: i.orderId } })
    if (!row) {
      NotInM3.push(i.orderId)
    }
  }

  res.status(200).json({
    status: 200,
    message: 'fetch Sucess',
    data: NotInM3
  })
}

exports.getWithdrawError = async (req, res) => {
  const channel = req.headers['x-channel']
  const { Distribution } = getModelsByChannel(channel, res, distributionModel)

  const withdrawData = await Distribution.find({
    status: ['approved', 'confirm'],
    withdrawType: { $ne: 'credit' },
    area: { $ne: 'IT211' }
  })

  let data = []

  for (item of withdrawData) {
    let typeError = ''
    const mgHead = await DisributionM3.findOne({
      where: { coNo: item.orderId }
    })
    const countProduct = item.listProduct.length

    if (mgHead) {
      if (countProduct === parseInt(item.lineM3)) {
        typeError = 'สินค้าครบ'
      } else {
        typeError = 'สินค้าไม่ครบ'
      }
    } else {
      typeError = 'ไม่เข้าระบบ M3'
    }

    const dataTran = {
      orderId: item.orderId,
      orderType: item.orderType,
      newTrip: item.newTrip,
      orderTypeName: item.orderTypeName,
      withdrawType: item.withdrawType,
      area: item.area,
      fromWarehouse: item.fromWarehouse,
      toWarehouse: item.toWarehouse,
      shippingId: item.shippingId,
      shippingRoute: item.shippingRoute,
      shippingName: item.shippingName,
      sendAddress: item.sendAddress,
      sendDate: item.sendDate,
      remark: item.remark,
      status: item.status,
      statusTH: item.statusTH,
      period: item.period,
      createdAt: toThaiTime(item.createdAt),
      updatedAt: toThaiTime(item.updatedAt),
      listProduct: countProduct,
      lineM3: item.lineM3 || '0',
      heightStatus: item.heightStatus || '0',
      lowStatus: item.lowStatus || '0',
      typeError: typeError
    }
    data.push(dataTran)
  }

  res.status(200).json({
    status: 200,
    message: 'fetch Sucess',
    data: data
  })
}

exports.UpdateWithdrawConjob = async (req, res) => {
  const channel = req.headers['x-channel']
  const { Distribution } = getModelsByChannel(channel, res, distributionModel)

  const withdrawData = await Distribution.find({
    // status: ['approved', 'confirm'],
    withdrawType: { $ne: 'credit' },
    area: { $ne: 'IT211' }
  })

  for (i of withdrawData) {
    const mgHead = await DisributionM3.findOne({ where: { coNo: i.orderId } })
    if (mgHead) {
      const count = await MGLINE.count({ where: { MRTRNR: i.orderId } })
      const lowStatus = mgHead.MGTRSL
      const highStatus = mgHead.MGTRSH

      await Distribution.updateOne(
        { orderId: i.orderId },
        {
          $set: {
            lineM3: count,
            lowStatus: lowStatus,
            heightStatus: highStatus
          }
        }
      )
    }
  }

  res.status(200).json({
    status: 200,
    message: 'Update Sucess'
    // data: NotInM3
  })
}

exports.uploadNPDData = async (req, res) => {
  try {
    const now = new Date()
    const period =
      now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, '0')
    const channel = req.headers['x-channel']
    const { Npd } = getModelsByChannel(channel, res, npdModel)
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' })
    }

    // 1️⃣ Read Excel file
    const workbook = xlsx.readFile(req.file.path)
    console.log(req.file)

    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' })

    // 2️⃣ Transform rows → desired JSON structure
    const formattedData = rows.map(row => {
      const { area, ...products } = row
      const npd = Object.keys(products).map(productId => ({
        productId: productId.toString(),
        qty: Number(products[productId]) || 0,
        unit: 'CTN'
      }))
      return { area, period, npd }
    })

    // 3️⃣ Insert or update (upsert)
    // for (const item of formattedData) {
    //   const exists = await Npd.findOne({ area: item.area })
    //   if (!exists) {
    //     await Npd.create(item)
    //   }
    // }
    await Npd.insertMany(formattedData)

    // 4️⃣ Respond
    return res.status(200).json({
      message: 'Upload successful',
      count: formattedData.length,
      data: formattedData
    })
  } catch (error) {
    console.error('Error uploading NPD data:', error)
    return res.status(500).json({ message: error.message })
  }
}
