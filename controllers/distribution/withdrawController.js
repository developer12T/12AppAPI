// const { Cart } = require('../../models/cash/cart')
// const { User } = require('../../models/cash/user')
// const { Product } = require('../../models/cash/product')
// const { Distribution, Place } = require('../../models/cash/distribution')
const { MHDISL, MHDISH, DisributionM3 } = require('../../models/cash/master')
const { sequelize, DataTypes } = require('../../config/m3db')
const { getSeries, updateRunningNumber } = require('../../middleware/order')
const axios = require('axios')
const { generateDistributionId } = require('../../utilities/genetateId')
const { rangeDate } = require('../../utilities/datetime')
const { period, previousPeriod } = require('../../utilities/datetime')
const cartModel = require('../../models/cash/cart')
const productModel = require('../../models/cash/product')
const distributionModel = require('../../models/cash/distribution')
const userModel = require('../../models/cash/user')
const stockModel = require('../../models/cash/stock')
const optionsModel = require('../../models/cash/option')
const { withdrawQuery } = require('../../controllers/queryFromM3/querySctipt')
const { getModelsByChannel } = require('../../middleware/channel')
const { query } = require('mssql')
const { exists } = require('fs')
const DistributionModel = require('../../models/cash/distribution')
require('dotenv').config()

const { formatDateTimeToThai } = require('../../middleware/order')
const { to2, updateStockMongo } = require('../../middleware/order')
const { getSocket } = require('../../socket')
const { sendEmail } = require('../../middleware/order')
const product = require('../../models/cash/product')
exports.checkout = async (req, res) => {
  const transaction = await sequelize.transaction()
  try {
    const { type, area, shippingId, withdrawType, sendDate, note, period } =
      req.body

    const channel = req.headers['x-channel']
    const { Cart } = getModelsByChannel(channel, res, cartModel)
    const { User } = getModelsByChannel(channel, res, userModel)
    const { Place } = getModelsByChannel(channel, res, distributionModel)
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Distribution } = getModelsByChannel(channel, res, distributionModel)
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
    const orderId = await generateDistributionId(
      area,
      sale.warehouse,
      channel,
      res
    )

    //  const orderId = await generateDistributionId(
    //   area,
    //   sale.warehouse,
    //   channel,
    //   res
    // )

    // const series = await getSeries(shipping.type)

    // console.log(shipping.type)

    // if (series == null) {
    //   const error = new Error('Order Type is incorrect or not found')
    //   error.statusCode = 422
    //   throw error
    // }

    // const runningJson = {
    //   coNo: '410',
    //   series: series.OOOT05,
    //   seriesType: '14'
    // }
    // const response = await axios.post(
    //   `${process.env.API_URL_12ERP}/master/runningNumber/`,
    //   {
    //     coNo: runningJson.coNo,
    //     series: runningJson.series,
    //     seriesType: runningJson.seriesType
    //   }
    // );
    // orderId = parseInt(response.data.lastNo) + 1

    // await updateRunningNumber(
    //   {
    //     coNo: runningJson.coNo,
    //     series: runningJson.series,
    //     seriesType: runningJson.seriesType,
    //     lastNo: orderId
    //   },
    //   transaction
    // )

    const newOrder = new Distribution({
      orderId,
      orderType: shipping.type,
      orderTypeName: shipping.typeNameTH,
      withdrawType: withdrawType,
      area,
      fromWarehouse,
      toWarehouse: sale.warehouse,
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
      period: period
    })

    const productQty = newOrder.listProduct.map(u => {
      return {
        id: u.id,
        // lot: u.lot,
        unit: u.unit,
        qty: u.qty,
        statusMovement: 'OUT'
      }
    })

    // for (const item of productQty) {

    //   const updateResult = await updateStockMongo(
    //     item,
    //     area,
    //     period,
    //     'withdraw',
    //     channel,
    //     res
    //   )
    //   if (updateResult) return

    // }

    // const sendDateFormat = new Date(newOrder.sendDate)
    // const formattedDate = sendDateFormat
    //   .toISOString()
    //   .slice(0, 10)
    //   .replace(/-/g, '')
    // const MGNUGL = newOrder.listProduct.map(i => i.id)
    // const uniqueCount = new Set(MGNUGL).size
    // let data = []
    // dataTran = {
    //   Hcase: 1,
    //   orderNo: newOrder.orderId,
    //   statusLow: '22',
    //   statusHigh: '22',
    //   orderType: newOrder.orderType,
    //   tranferDate: formattedDate,
    //   warehouse: newOrder.fromWarehouse,
    //   towarehouse: newOrder.toWarehouse,
    //   routeCode: newOrder.shippingRoute,
    //   addressCode: newOrder.shippingId,
    //   location: '',
    //   MGNUGL: uniqueCount,
    //   MGDEPT: '',
    //   remark: '',
    //   items: newOrder.listProduct.map(u => ({
    //     itemCode: u.id,
    //     itemStatus: '22',
    //     MRWHLO: newOrder.fromWarehouse,
    //     itemQty: u.qty,
    //     itemUnit: u.unit,
    //     toLocation: '',
    //     itemLot: '',
    //     location: '',
    //     itemLocation: ''
    //   }))
    // }
    // data.push(dataTran)

    // // 2. ส่งไป External API (ถ้า fail -> return error)
    // let response;
    // try {
    //   response = await axios.post(
    //     `${process.env.API_URL_12ERP}/distribution/insertdistribution`,
    //     data
    //   );
    // } catch (err) {
    //   if (err.response) {
    //     console.log('API error response:', err.response.data);
    //     console.log('Status:', err.response.status);
    //     return res.status(500).json({
    //       status: 500,
    //       message: 'External API failed',
    //       error: err.response.data    // <-- error ที่มาจากปลายทางจริง
    //     });
    //   } else if (err.request) {
    //     console.log('No response from API:', err.message);
    //     return res.status(500).json({
    //       status: 500,
    //       message: 'External API unreachable',
    //       error: err.message
    //     });
    //   } else {
    //     console.log('Other error:', err.message);
    //     return res.status(500).json({
    //       status: 500,
    //       message: 'External API error',
    //       error: err.message
    //     });
    //   }
    // }

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

exports.getOrder = async (req, res) => {
  try {
    const { type, area, period, zone, team, year, month } = req.query
    const channel = req.headers['x-channel']

    const { Distribution } = getModelsByChannel(channel, res, distributionModel)
    const { User } = getModelsByChannel(channel, res, userModel)

    // let response = []
    if (!type || !period) {
      return res
        .status(400)
        .json({ status: 400, message: 'type,  period are required!' })
    }

    const { startDate, endDate } = rangeDate(period)
    let statusQuery = {}
    if (type === 'pending') {
      statusQuery.status = { $in: ['pending', 'approved', 'rejected'] }
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
      // ...statusQuery,
      period: period
    }

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
          orderType: o.orderType,
          orderTypeName: o.orderTypeName,
          sendDate: o.sendDate,
          total: o.totalQty || 0,
          status: o.status,
          createdAt: formatDateTimeToThai(o.createdAt)
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
        sendAddress: u.sendAddress,
        sendDate: u.sendDate,
        remark: u.remark,
        listProduct: u.listProduct.map(p => {
          return {
            id: p.id,
            name: p.name,
            group: p.group,
            brand: p.brand,
            size: p.size,
            flavour: p.flavour,
            qty: p.qty,
            unit: p.unit,
            qtyPcs: p.qtyPcs,
            price: p.price,
            total: p.total,
            weightGross: p.weightGross,
            weightNet: p.weightNet,
            receiveQty: p.receiveQty,
            _id: p._id
          }
        }),
        total: u.total,
        totalQty: u.totalQty,
        totalWeightGross: u.totalWeightGross,
        totalWeightNet: u.totalWeightNet,
        receivetotal: u.receivetotal,
        receivetotalQty: u.receivetotalQty,
        receivetotalWeightGross: u.receivetotalWeightGross,
        receivetotalWeightNet: u.receivetotalWeightNet,
        status: u.status,
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

exports.approveWithdraw = async (req, res) => {
  try {
    const { orderId, status } = req.body
    let statusStr = status === true ? 'approved' : 'rejected'
    let statusThStr = status === true ? 'อนุมัติ' : 'ไม่อนุมัติ'

    const channel = req.headers['x-channel']
    const { Distribution, WereHouse } = getModelsByChannel(
      channel,
      res,
      distributionModel
    )
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Stock } = getModelsByChannel(channel, res, stockModel)
    const { Option } = getModelsByChannel(channel, res, optionsModel)

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

      let response
      try {
        response = await axios.post(
          `${process.env.API_URL_12ERP}/distribution/insertdistribution`,
          data
        )
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

      const distributionData = await Distribution.findOneAndUpdate(
        { orderId: orderId, type: 'withdraw' },
        { $set: { statusTH: statusThStr, status: statusStr } },
        { new: true }
      )

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

      // console.log(process.env.BANK_MAIL)
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
      <strong>ประเภทการจัดส่ง:</strong> ${distributionTran.orderTypeName}<br>
      <strong>จัดส่ง:</strong> ${distributionTran.fromWarehouse}${'-' + wereHouseName?.wh_name || ''
          }<br>
      <strong>สถานที่จัดส่ง:</strong> ${distributionTran.toWarehouse}-${distributionTran.shippingName
          }<br>
      <strong>วันที่จัดส่ง:</strong> ${distributionTran.sendDate}<br>
      <strong>เขต:</strong> ${distributionTran.area}<br>
      <strong>ชื่อ:</strong> ${userData.firstName} ${userData.surName}<br>
      <strong>เบอร์โทรศัพท์เซลล์:</strong> ${userData.tel}<br>
      <strong>หมายเหตุ:</strong> ${distributionTran.remark}
    </p>
  `
      })
      const io = getSocket()
      io.emit('distribution/approveWithdraw', {
        status: 200,
        message: 'successfully',
        data: dataTran
      })

      res.status(200).json({
        status: 200,
        message: 'successfully',
        data: dataTran
      })
    } else {
      const distributionData = await Distribution.findOneAndUpdate(
        { orderId: orderId, type: 'withdraw' },
        { $set: { statusTH: statusThStr, status: statusStr } },
        { new: true }
      )

      res.status(200).json({
        status: 200,
        message: 'successfully',
        data: statusStr
      })
    }
  } catch (error) {
    console.error('[❌ approveWithdraw ERROR]', error) // แสดงใน console
    res.status(500).json({
      status: 500,
      message: error.message,
      stack: error.stack // เพิ่มเพื่อ debug ลึกขึ้น (optional)
    })
  }
}

const withdrawUpdateTimestamps = {}

exports.saleConfirmWithdraw = async (req, res) => {
  try {
    const { orderId, status } = req.body

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

      if (
        !Array.isArray(distributionTran.listProduct) ||
        distributionTran.listProduct.length === 0
      ) {
        return res.status(400).json({
          status: 400,
          message: 'No products found in withdrawal transaction.'
        })
      }

      const row = await DisributionM3.findOne({ where: { coNo: orderId } });
      if (!row) return res.status(404).json({ status: 404, message: `${orderId} not found` });

      const toNum = v => Number(String(v ?? '').trim()); // แปลง NVARCHAR -> Number, ตัดช่องว่าง
      const MGTRSL = toNum(row.MGTRSL);
      const MGTRSH = toNum(row.MGTRSH);

      // ถ้าต้องการให้ "ทั้งสองค่า" ต้องเป็น 90 ถึงจะผ่าน
      if (MGTRSL !== 90 && MGTRSH !== 90) {
        return res.status(400).json({
          status: 400,
          message: `${orderId} is not 90 (MGTRSL=${row.MGTRSL}, MGTRSH=${row.MGTRSH})`
        });
      }


      // ✅ ดึงข้อมูลสินค้าที่เกี่ยวข้อง
      const listProductId = distributionTran.listProduct
        .map(i => i.id)
        .filter(Boolean)
      const productDetail = await Product.find({ id: { $in: listProductId } })

      // ✅ ดึงข้อมูลรับสินค้าจากระบบ ERP
      const Receive = await MHDISL.findAll({
        where: { coNo: orderId },
        raw: true
      })
      const ReceiveWeight = await MHDISH.findAll({
        where: { coNo: orderId },
        raw: true
      })

      let receivetotalQty = 0
      let receivetotal = 0

      for (const i of distributionTran.listProduct) {
        const productIdTrimmed = String(i.id || '').trim()
        const match = Receive.find(
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

      // ✅ อัปเดตข้อมูลถ้า status เป็น approved
      if (distributionTran.status === 'approved') {
        // บันทึก listProduct ที่แก้ไขแล้ว
        await Distribution.updateOne(
          { _id: distributionTran._id },
          { $set: { listProduct: distributionTran.listProduct } }
        )

        const distributionData = await Distribution.findOneAndUpdate(
          { orderId, type: 'withdraw' },
          {
            $set: {
              statusTH: 'ยืนยันรับของ',
              status: 'confirm',
              receivetotal: receivetotal,
              receivetotalQty: receivetotalQty,
              receivetotalWeightGross: ReceiveWeight?.[0]?.weightGross || 0,
              receivetotalWeightNet: ReceiveWeight?.[0]?.weightNet || 0
            }
          },
          { new: true }
        )

        if (!distributionData) {
          return res.status(404).json({
            status: 404,
            message: 'Withdraw transaction not found for update.'
          })
        }

        if (!distributionTran.period) {
          return res.status(400).json({
            status: 400,
            message: 'Period is missing in withdrawal transaction.'
          })
        }

        // ✅ อัปเดตสต๊อก
        const qtyproduct = distributionTran.listProduct
          .filter(u => u?.id && u?.receiveUnit && u?.receiveQty > 0)
          .map(u => ({
            id: u.id,
            unit: u.receiveUnit,
            qty: u.receiveQty,
            // statusMovement: 'OUT'
          }))

        for (const item of qtyproduct) {
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

        // ✅ ส่ง socket แจ้งผล
        const io = getSocket()
        io.emit('distribution/saleConfirmWithdraw', {
          status: 200,
          message: 'Confirm withdraw success'
        })

        return res.status(200).json({
          status: 200,
          message: 'Confirm withdraw success'
        })
      } else {
        return res.status(409).json({
          status: 409,
          message: 'Status withdraw is pending'
        })
      }
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



