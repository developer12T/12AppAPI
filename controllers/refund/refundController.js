// const { Refund } = require('../../models/cash/refund')
// const { Order } = require('../../models/cash/sale')
// const { Cart } = require('../../models/cash/cart')
// const { User } = require('../../models/cash/user')
const {
  generateOrderId,
  generateRefundId
} = require('../../utilities/genetateId')
const { summaryRefund } = require('../../utilities/summary')
const { rangeDate } = require('../../utilities/datetime')
const { uploadFiles } = require('../../utilities/upload')
const path = require('path')
const multer = require('multer')
const upload = multer({ storage: multer.memoryStorage() }).single('image')
const { period, previousPeriod } = require('../../utilities/datetime')
const refundModel = require('../../models/cash/refund')
const orderModel = require('../../models/cash/sale')
const cartModel = require('../../models/cash/cart')
const productModel = require('../../models/cash/product')
const userModel = require('../../models/cash/user')
const stockModel = require('../../models/cash/stock')
const { getModelsByChannel } = require('../../middleware/channel')
const {
  to2,
  getQty,
  updateStockMongo,
  getPeriodFromDate
} = require('../../middleware/order')
const { update } = require('lodash')
const { getSocket } = require('../../socket')

const orderTimestamps = {}

exports.checkout = async (req, res) => {
  try {
    const {
      type,
      area,
      period,
      storeId,
      note,
      latitude,
      longitude,
      shipping,
      payment
    } = req.body
    const channel = req.headers['x-channel']
    const { Cart } = getModelsByChannel(channel, res, cartModel)
    const { User } = getModelsByChannel(channel, res, userModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Product } = getModelsByChannel(channel, res, productModel)

    const { Stock, StockMovementLog, StockMovement } = getModelsByChannel(
      channel,
      res,
      stockModel
    )

    if (!type || type !== 'refund') {
      return res
        .status(400)
        .json({ status: 400, message: 'Invalid type! Must be "refund".' })
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

    if (!type || !area || !storeId || !shipping || !payment) {
      return res
        .status(400)
        .json({ status: 400, message: 'Missing required fields!' })
    }

    // console.log(type, area, storeId)

    const cart = await Cart.findOne({ type, area, storeId })
    // console.log("cart",cart)
    // if (!cart || cart.listProduct.length === 0) {
    if (!cart || cart.length === 0) {
      return res.status(404).json({ status: 404, message: 'Cart is empty!' })
    }

    const sale = await User.findOne({ area }).select(
      'username firstName surName warehouse tel saleCode salePayer'
    )
    if (!sale) {
      return res
        .status(404)
        .json({ status: 404, message: 'Sale user not found!' })
    }

    const refundOrderId = await generateRefundId(
      area,
      sale.warehouse,
      channel,
      res
    )
    const changeOrderId = await generateOrderId(
      area,
      sale.warehouse,
      channel,
      res
    )

    const summary = await summaryRefund(cart, channel, res)
    // console.log('summary:', JSON.stringify(summary, null, 2))

    const refundOrder = new Refund({
      type: 'refund',
      orderId: refundOrderId,
      reference: changeOrderId,
      sale: {
        saleCode: sale.saleCode,
        salePayer: sale.salePayer,
        name: `${sale.firstName} ${sale.surName}`,
        tel: sale.tel,
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
      listProduct: summary.listRefund,
      total: summary.totalRefund,
      totalExVat: parseFloat((summary.totalRefund / 1.07).toFixed(2)),
      vat: parseFloat(
        (summary.totalRefund - summary.totalRefund / 1.07).toFixed(2)
      ),
      listImage: [],
      createdBy: sale.username,
      period: period
    })

    // console.log("refundOrder",refundOrder)
    const changeOrder = new Order({
      type: 'change',
      orderId: changeOrderId,
      reference: refundOrderId,
      sale: {
        saleCode: sale.saleCode,
        salePayer: sale.salePayer,
        name: `${sale.firstName} ${sale.surName}`,
        tel: sale.tel,
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
      // shipping: shipping,
      note,
      latitude,
      longitude,
      status: 'pending',
      statusTH: 'รอนำเข้า',
      listProduct: summary.listProduct,
      subtotal: summary.totalChange,
      total: summary.totalChange,
      totalExVat: parseFloat((summary.totalChange / 1.07).toFixed(2)),
      vat: parseFloat(
        (summary.totalChange - summary.totalChange / 1.07).toFixed(2)
      ),
      listPromotions: [],
      listImage: [],
      paymentMethod: payment,
      paymentStatus: 'unpaid',
      createdBy: sale.username,
      period: period
    })

    const qtyproduct = refundOrder.listProduct
      .filter(u => u.condition === 'good')
      .map(u => ({
        id: u.id,
        unit: u.unit,
        qty: u.qty,
        condition: u.condition,
        statusMovement: 'IN'
      }))

    const qtyproductchange = changeOrder.listProduct.map(u => {
      //   const promoDetail = u.listProduct.map(item => {
      return {
        id: u.id,
        unit: u.unit,
        qty: u.qty,
        statusMovement: 'OUT'
      }
      //   })
    })
    // console.log(qtyproductchange)
    // const fallbackPeriod = period || refundOrder.period
    // if (!fallbackPeriod) throw new Error('Missing period')

    const refundCalStock = {
      storeId: refundOrder.store.storeId,
      orderId: refundOrder.orderId,
      area: refundOrder.store.area,
      saleCode: refundOrder.sale.saleCode,
      period: period,
      warehouse: refundOrder.sale.warehouse,
      status: 'pending',
      statusTH: 'รอนำเข้า',
      action: 'Refund',
      type: 'Refund',
      product: qtyproduct
    }

    const changeCalStock = {
      storeId: refundOrder.store.storeId,
      orderId: refundOrder.orderId,
      area: refundOrder.store.area,
      saleCode: refundOrder.sale.saleCode,
      period: period,
      warehouse: refundOrder.sale.warehouse,
      status: 'pending',
      statusTH: 'รอนำเข้า',
      action: 'Change',
      type: 'Change',
      product: qtyproductchange
    }
    // ตัด stock เบล ver
    // const productQty = qtyproductPro.concat(qtyproduct);

    // for (const item of qtyproduct) {
    //   const factorPcsResult = await Product.aggregate([
    //     { $match: { id: item.productId } },
    //     {
    //       $project: {
    //         id: 1,
    //         listUnit: {
    //           $filter: {
    //             input: '$listUnit',
    //             as: 'unitItem',
    //             cond: { $eq: ['$$unitItem.unit', item.unit] }
    //           }
    //         }
    //       }
    //     }
    //   ])

    //   const factorCtnResult = await Product.aggregate([
    //     { $match: { id: item.productId } },
    //     {
    //       $project: {
    //         id: 1,
    //         listUnit: {
    //           $filter: {
    //             input: '$listUnit',
    //             as: 'unitItem',
    //             cond: { $eq: ['$$unitItem.unit', 'CTN'] }
    //           }
    //         }
    //       }
    //     }
    //   ])
    //   const factorCtn = factorCtnResult[0].listUnit[0].factor
    //   const factorPcs = factorPcsResult[0].listUnit[0].factor
    //   const factorPcsQty = item.qty * factorPcs
    //   const factorCtnQty = Math.floor(factorPcsQty / factorCtn)
    //   const data = await Stock.findOneAndUpdate(
    //     {
    //       area: area,
    //       period: period,
    //       'listProduct.productId': item.productId
    //     },
    //     {
    //       $inc: {
    //         'listProduct.$[elem].stockInPcs': +factorPcsQty,
    //         // 'listProduct.$[elem].balancePcs': +factorPcsQty,
    //         'listProduct.$[elem].stockInCtn': +factorCtnQty,
    //         // 'listProduct.$[elem].balanceCtn': +factorCtnQty
    //       }
    //     },
    //     {
    //       arrayFilters: [{ 'elem.productId': item.productId }],
    //       new: true
    //     }
    //   )
    // }

    // for (const item of qtyproductchange) {
    //   const factorPcsResult = await Product.aggregate([
    //     { $match: { id: item.productId } },
    //     {
    //       $project: {
    //         id: 1,
    //         listUnit: {
    //           $filter: {
    //             input: '$listUnit',
    //             as: 'unitItem',
    //             cond: { $eq: ['$$unitItem.unit', item.unit] }
    //           }
    //         }
    //       }
    //     }
    //   ])

    //   const factorCtnResult = await Product.aggregate([
    //     { $match: { id: item.productId } },
    //     {
    //       $project: {
    //         id: 1,
    //         listUnit: {
    //           $filter: {
    //             input: '$listUnit',
    //             as: 'unitItem',
    //             cond: { $eq: ['$$unitItem.unit', 'CTN'] }
    //           }
    //         }
    //       }
    //     }
    //   ])
    //   const factorCtn = factorCtnResult[0].listUnit[0].factor
    //   const factorPcs = factorPcsResult[0].listUnit[0].factor
    //   const factorPcsQty = item.qty * factorPcs
    //   const factorCtnQty = Math.floor(factorPcsQty / factorCtn)
    //   const data = await Stock.findOneAndUpdate(
    //     {
    //       area: area,
    //       period: period,
    //       'listProduct.productId': item.productId
    //     },
    //     {
    //       $inc: {
    //         'listProduct.$[elem].stockOutPcs': +factorPcsQty,
    //         // 'listProduct.$[elem].balancePcs': -factorPcsQty,
    //         'listProduct.$[elem].stockOutCtn': +factorCtnQty,
    //         // 'listProduct.$[elem].balanceCtn': -factorCtnQty
    //       }
    //     },
    //     {
    //       arrayFilters: [{ 'elem.productId': item.productId }],
    //       new: true
    //     }
    //   )
    // }

    const createdMovementRefund = await StockMovement.create({
      ...refundCalStock
    })

    await StockMovementLog.create({
      ...refundCalStock,
      refOrderId: createdMovementRefund._id
    })

    const createdMovementChange = await StockMovement.create({
      ...changeCalStock
    })

    await StockMovementLog.create({
      ...changeCalStock,
      refOrderId: createdMovementChange._id
    })

    await refundOrder.save()
    await changeOrder.save()
    await Cart.deleteOne({ type, area, storeId })

    const io = getSocket()
    io.emit('refund/checkout', {
      status: 200,
      message: 'Checkout successful!',
      data: {
        refundOrder,
        // listProduct
        changeOrder
      }
    })

    res.status(200).json({
      status: 200,
      message: 'Checkout successful!',
      data: {
        refundOrder,
        // listProduct
        changeOrder
      }
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getRefund = async (req, res) => {
  try {
    const { type, area, zone, team, store, period } = req.query

    const channel = req.headers['x-channel']
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)

    let response = []

    if (!type || !period) {
      return res
        .status(400)
        .json({ status: 400, message: 'type,  period are required!' })
    }

    const { startDate, endDate } = rangeDate(period)

    let areaQuery = {}
    // let query = {}

    if (zone && !area) {
      areaQuery['store.area'] = { $regex: `^${zone}`, $options: 'i' }
    } else if (area.length == 5) {
      areaQuery['store.area'] = area
    }

    // if (area) {
    //   areaQuery.area = area
    // } else if (zone) {
    //   areaQuery.area = { $regex: `^${zone}`, $options: 'i' }
    // }

    let query = {
      type,
      ...areaQuery,
      period: period
    }

    if (store) {
      query['store.storeId'] = store
    }

    const pipeline = [
      // { $match: { status: 'pending' } },
      {
        $addFields: {
          zone: { $substrBytes: ['$store.area', 0, 2] },
          team3: {
            $concat: [
              { $substrCP: ['$store.area', 0, 2] },
              { $substrCP: ['$store.area', 3, 1] }
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

    pipeline.push(
      {
        $project: {
          _id: 0,
          __v: 0,
          beauty: 0
        }
      },
      {
        $sort: {
          status: 1,
          createdAt: -1
        }
      }
    )

    const refunds = await Refund.aggregate(pipeline)

    // console.log(refunds)
    if (!refunds || refunds.length === 0) {
      return res.status(404).json({
        status: 404,
        message: 'No refund orders found!',
        data: []
      })
    }

    response = await Promise.all(
      refunds.map(async refund => {
        const orderChange = await Order.findOne({
          reference: refund.orderId,
          type: 'change'
        })
          .select('total')
          .lean()

        const totalChange = orderChange?.total || 0
        const totalRefund = refund.total || 0
        const total = (totalChange - totalRefund).toFixed(2)

        return {
          orderId: refund.orderId,
          area: refund.store.area,
          storeId: refund.store?.storeId || '',
          storeName: refund.store?.name || '',
          storeAddress: refund.store?.address || '',
          totalChange: totalChange.toFixed(2),
          totalRefund: totalRefund.toFixed(2),
          total: total,
          status: refund.status,
          createdAt: refund.createdAt,
          updatedAt: refund.updatedAt
        }
      })
    )

    const responseSort = response.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    )

    // const io = getSocket()
    // io.emit('refund/all', {});

    res.status(200).json({
      status: 200,
      message: 'Successful!',
      data: responseSort
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
      return res.status(400).json({
        status: 400,
        message: 'orderId is required!'
      })
    }

    const channel = req.headers['x-channel']
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)

    const refund = await Refund.findOne({ orderId }).lean()
    if (!refund) {
      return res.status(404).json({ status: 404, message: 'Refund not found!' })
    }

    const order = await Order.findOne({
      reference: refund.orderId,
      type: 'change'
    }).lean()

    const listProductRefund = refund.listProduct.map(product => ({
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
      netTotal: product.total,
      condition: product.condition,
      expireDate: product.expireDate
    }))

    const listProductChange = order
      ? order.listProduct.map(product => ({
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
        netTotal: product.netTotal
      }))
      : []

    const totalChange = order ? order.total : 0
    const totalChangeExVat = parseFloat((totalChange / 1.07).toFixed(2))
    const totalChangeVat = parseFloat(
      (totalChange - totalChangeExVat).toFixed(2)
    )
    const totalRefund = refund.total
    const totalRefundExVat = parseFloat((totalRefund / 1.07).toFixed(2))
    const totalRefundVat = parseFloat(
      (totalRefund - totalRefundExVat).toFixed(2)
    )
    const total = parseFloat((totalChange - totalRefund).toFixed(2))

    // const io = getSocket()
    // io.emit('refund/detail', {});

    res.status(200).json({
      type: refund.type,
      orderId: refund.orderId,
      reference: refund.reference || '',
      sale: refund.sale,
      store: refund.store,
      note: refund.note,
      latitude: refund.latitude,
      longitude: refund.longitude,
      shipping: refund.shipping || { shippingId: '', address: '' },
      status: refund.status,
      listProductRefund,
      listProductChange,
      totalRefundExVat,
      totalRefundVat,
      totalRefund,
      totalChangeExVat,
      totalChangeVat,
      totalChange,
      totalDiff: total,
      paymentMethod: refund.paymentMethod || 'cash',
      paymentStatus: refund.paymentStatus || 'unpaid',
      createdAt: refund.createdAt,
      updatedAt: refund.updatedAt,
      listImage: order ? order.listImage || [] : []
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: 500, message: error.message })
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
      io.emit('refund/addSlip', {
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

exports.updateStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body
    const channel = req.headers['x-channel']

    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)

    const changeOrder = await Order.findOne({ reference: orderId })

    if (!changeOrder) {
      return res.status(404).json({
        status: 404,
        message: 'Not found change Order'
      })
    }

    let statusTH = ''

    if (!orderId || !status) {
      return res.status(400).json({
        status: 400,
        message: 'orderId and status are required!'
      })
    }

    const refundOrder = await Refund.findOne({ orderId })

    if (!refundOrder) {
      return res.status(404).json({
        status: 404,
        message: 'Refund order not found!'
      })
    }

    if (refundOrder.status !== 'pending' && status !== 'canceled') {
      return res.status(400).json({
        status: 400,
        message: 'Cannot update status, refund is not in pending state!'
      })
    }

    const productChange = changeOrder.listProduct.map(u => {
      return {
        id: u.id,
        unit: u.unit,
        qty: u.qty
      }
    })

    const productQty = refundOrder.listProduct.map(u => {
      return {
        id: u.id,
        unit: u.unit,
        qty: u.qty,
        condition: u.condition
      }
    })
    let newOrderId = orderId
    if (status === 'canceled') {
      statusTH = 'ยกเลิก'
      if (!changeOrder.orderId.endsWith('CC')) {
        let counter = 1;
        newOrderId = `${changeOrder.orderId}CC${counter++}`;
      }
      for (const item of productChange) {
        const updateResult = await updateStockMongo(
          item,
          changeOrder.store.area,
          changeOrder.period,
          'deleteCart',
          channel,
          res
        )
        if (updateResult) return
      }

      const updatedOrder = await Order.findOneAndUpdate(
        { reference: orderId },
        { $set: { status, statusTH, orderId: newOrderId } },
        { new: true }
      )
      // console.log(orderId)

    } else if (status === 'rejected') {
      statusTH = 'ถูกปฏิเสธ'
      if (!changeOrder.orderId.endsWith('CC')) {
        let counter = 1;
        newOrderId = `${changeOrder.orderId}CC${counter++}`;
      }

      console.log(productChange)
      for (const item of productChange) {
        const updateResult = await updateStockMongo(
          item,
          changeOrder.store.area,
          changeOrder.period,
          'deleteCart',
          channel,
          res
        )
        if (updateResult) return
      }
      const updatedOrder = await Order.findOneAndUpdate(
        { reference: orderId },
        { $set: { status, statusTH, orderId: newOrderId } },
        { new: true }
      )

    } else if (status === 'approved') {
      statusTH = 'อนุมัติ'

      for (const item of productQty) {
        // console.log(item)
        if (item.condition != 'damaged') {
          const updateResult = await updateStockMongo(
            item,
            refundOrder.store.area,
            refundOrder.period,
            'withdraw',
            channel,
            res
          )
          if (updateResult) return
        }
      }

      for (const item of productChange) {
        const updateResult = await updateStockMongo(
          item,
          changeOrder.store.area,
          changeOrder.period,
          'sale',
          channel,
          res
        )
        if (updateResult) return
        // console.log('item', item)
      }
    }

    await Refund.findOneAndUpdate(
      { orderId },
      { $set: { status, statusTH } },
      { new: true }
    )

    await Order.findOneAndUpdate(
      { orderId: refundOrder.reference, type: 'change' },
      { $set: { status, statusTH } },
      { new: true }
    )

    const io = getSocket()
    io.emit('refund/updateStatus', {
      status: 200,
      message: 'Updated status successfully!',
      data: orderId
    })

    res.status(200).json({
      status: 200,
      message: 'Updated status successfully!'
    })
  } catch (error) {
    console.error('Error updating refund status:', error)
    res.status(500).json({ status: 500, message: 'Server error' })
  }
}

exports.deleteRefund = async (req, res) => {
  try {
    const { orderId } = req.body
    const channel = req.headers['x-channel']
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)

    // ตรวจสอบ Refund ก่อน
    const refundExists = await Refund.findOne({ orderId })
    if (!refundExists) {
      return res.status(404).json({
        status: 404,
        message: 'Refund not found'
      })
    }

    // ตรวจสอบ Order ก่อน
    const orderExists = await Order.findOne({
      reference: orderId,
      type: 'change'
    })
    if (!orderExists) {
      return res.status(404).json({
        status: 404,
        message: 'Order (change type) not found'
      })
    }

    // อัปเดต refund
    const refund = await Refund.findOneAndUpdate(
      { orderId },
      { status: 'delete', statusTH: 'ถูกลบ' },
      { new: true }
    )

    // อัปเดต order
    const order = await Order.findOneAndUpdate(
      { reference: orderId, type: 'change' },
      { status: 'delete', statusTH: 'ถูกลบ' },
      { new: true }
    )

    res.status(200).json({
      status: 200,
      message: 'Refund and order marked as deleted successfully!'
      // data: refund,
      // order: order
    })
  } catch (error) {
    console.error('Error updating refund status:', error)
    res.status(500).json({ status: 500, message: 'Server error' })
  }
}
