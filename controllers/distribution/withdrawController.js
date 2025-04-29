const { Cart } = require('../../models/cash/cart')
const { User } = require('../../models/cash/user')
const { Product } = require('../../models/cash/product')
const { Distribution, Place } = require('../../models/cash/distribution')
const { generateDistributionId } = require('../../utilities/genetateId')
const { rangeDate } = require('../../utilities/datetime')

exports.checkout = async (req, res) => {
  try {
    const { type, area, shippingId, withdrawType, sendDate, note } = req.body

    if (!type || !area || !shippingId || !withdrawType || !sendDate || !note) {
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

    const fromWarehouse =
      withdrawType === 'normal'
        ? shipping.warehouse?.normal
        : shipping.warehouse?.clearance

    if (!fromWarehouse) {
      return res
        .status(400)
        .json({
          status: 400,
          message: 'Invalid withdrawType or missing warehouse data!'
        })
    }

    const productIds = cart.listProduct.map(p => p.id)
    const products = await Product.find({ id: { $in: productIds } }).select(
      'id name group brand size flavour weightGross weightNet listUnit'
    )

    let subtotal = 0
    let totalQty = 0
    let totalWeightGross = 0
    let totalWeightNet = 0
    let listProduct = cart.listProduct.map(item => {
      const product = products.find(p => p.id === item.id)
      if (!product) return null

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
    const orderId = await generateDistributionId(area, sale.warehouse)

    const newOrder = new Distribution({
      orderId,
      orderType: shipping.type,
      orderTypeName: shipping.typeNameTH,
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
      createdBy: sale.username
    })

    await newOrder.save()
    // await Cart.deleteOne({ type, area })

    res.status(200).json({
      status: 200,
      message: 'Checkout successful!',
      data: { orderId, total: subtotal, qty: totalQty }
    })
  } catch (error) {
    console.error('Error saving store to MongoDB:', error)
    res.status(500).json({ status: '500', message: 'Server Error' })
  }
}

exports.getOrder = async (req, res) => {
  try {
    const { type, area, period } = req.query
    let response = []
    if (!type || !area || !period) {
      return res
        .status(400)
        .json({ status: 400, message: 'type, area, period are required!' })
    }

    const { startDate, endDate } = rangeDate(period)
    // console.log('startDate', startDate)
    // console.log('endDate', endDate)

    const status = type === 'history' ? { $ne: 'pending' } : 'pending'

    let query = {
      area,
      status,
      createdAt: {
        $gte: startDate,
        $lt: endDate
      }
    }

    const order = await Distribution.find(query)
    // const order2 = await Distribution.find();
    console.log(order)

    if (!order) {
      return res
        .status(404)
        .json({ status: 404, message: 'Distribution order not found!' })
    }

    response = order.map(o => ({
      area: o.area,
      orderId: o.orderId,
      orderType: o.orderType,
      orderTypeName: o.orderTypeName,
      sendDate: o.sendDate,
      total: o.totalQty || 0,
      status: o.status,
      created: o.created
    }))

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
    if (!orderId) {
      return res
        .status(400)
        .json({ status: 400, message: 'orderId is required!' })
    }

    const order = await Distribution.findOne({ orderId })

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

exports.updateStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body

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
      return res
        .status(400)
        .json({
          status: 400,
          message: 'Cannot update status, distribution is not in pending state!'
        })
    }

    let newOrderId = orderId

    if (status === 'canceled' && !orderId.endsWith('CC')) {
      newOrderId = `${orderId}CC`

      const isDuplicate = await Distribution.findOne({ orderId: newOrderId })
      if (isDuplicate) {
        let counter = 1
        while (
          await Distribution.findOne({ orderId: `${orderId}CC${counter}` })
        ) {
          counter++
        }
        newOrderId = `${orderId}CC${counter}`
      }
    }

    const updatedOrder = await Distribution.findOneAndUpdate(
      { orderId },
      { $set: { status, orderId: newOrderId } },
      { new: true }
    )

    res.status(200).json({
      status: 200,
      message: 'Updated status successfully!'
    })
  } catch (error) {
    console.error('Error updating order:', error)
    res.status(500).json({ status: 500, message: 'Server error' })
  }
}
