const { Order } = require('../../models/cash/sale')
const { Cart } = require('../../models/cash/cart')
const { User } = require('../../models/cash/user')
const { Product } = require('../../models/cash/product')
const { Route } = require('../../models/cash/route')
const { generateOrderId } = require('../../utilities/genetateId')
const { summaryOrder,summaryOrderProStatusOne } = require('../../utilities/summary')
const { rangeDate } = require('../../utilities/datetime')
const { uploadFiles } = require('../../utilities/upload')
const { checkInRoute } = require('../route/checkIn')
const multer = require('multer')
const path = require('path')
const upload = multer({ storage: multer.memoryStorage() }).single('image')

exports.checkout = async (req, res) => {
  try {
    const {
      type,
      area,
      storeId,
      routeId,
      note,
      latitude,
      longitude,
      shipping,
      payment,
      changePromotionStatus,
      listPromotion = []

    } = req.body



    if (!type || !area || !storeId || !shipping || !payment) {
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

    let summary = ''
    if (changePromotionStatus == 0) {
      summary = await summaryOrder(cart)
      // console.log(summary)

    // const shippingData = store.shippingAddress.find(s => s.shippingId === shipping)
    // if (!shippingData) {
    //     return res.status(404).json({ status: 404, message: 'Shipping address not found!' })
    // }

    const productIds = cart.listProduct.map(p => p.id)
    const products = await Product.find({ id: { $in: productIds } }).select(
      'id name group brand size flavour listUnit'
    )

    let subtotal = 0
    let listProduct = cart.listProduct.map(item => {
      const product = products.find(p => p.id === item.id)
      if (!product) return null

      const unitData = product.listUnit.find(u => u.unit === item.unit)
      if (!unitData) {
        return res
          .status(400)
          .json({ status: 400, message: `Invalid unit for product ${item.id}` })
      }

      const totalPrice = item.qty * unitData.price.sale
      subtotal += totalPrice

      return {
        id: product.id,
        name: product.name,
        group: product.group,
        brand: product.brand,
        size: product.size,
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
    const orderId = await generateOrderId(area, sale.warehouse)

    const newOrder = new Order({
      orderId,
      type,
      status: 'pending',
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
      listProduct,
      listPromotions: summary.listPromotion,
      subtotal,
      discount: 0,
      discountProduct: 0,
      vat: 0,
      totalExVat: 0,
      total: subtotal,
      // shipping: {
      //     shippingId: shippingData.shippingId,
      //     address: shippingData.address,
      //     dateRequest: shipping.dateRequest,
      //     note: shipping.note
      // },
      shipping: {
        shippingId: '',
        address: ''
      },
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      createdBy: sale.username
    })

    await newOrder.save()
    // await Cart.deleteOne({ type, area, storeId })

    const checkIn = await checkInRoute({
      storeId: storeId,
      routeId: routeId,
      orderId: orderId,
      note: note,
      latitude: latitude,
      longitude: longitude
    })

    // console.log('checkin', checkIn)

    res.status(200).json({
      status: 200,
      message: 'Checkout successful!',
      data: newOrder
    })

    }
    else if (changePromotionStatus == 1) {
      summary = await summaryOrderProStatusOne(cart,listPromotion)
      // console.log("summaryOrderProStatusOne")
      // console.log(summary)

      const productIds = cart.listProduct.map(p => p.id)
      const products = await Product.find({ id: { $in: productIds } }).select(
        'id name group brand size flavour listUnit'
      )
  
      let subtotal = 0
      let listProduct = cart.listProduct.map(item => {
        const product = products.find(p => p.id === item.id)
        if (!product) return null
  
        const unitData = product.listUnit.find(u => u.unit === item.unit)
        if (!unitData) {
          return res
            .status(400)
            .json({ status: 400, message: `Invalid unit for product ${item.id}` })
        }
  
        const totalPrice = item.qty * unitData.price.sale
        subtotal += totalPrice
  
        return {
          id: product.id,
          name: product.name,
          group: product.group,
          brand: product.brand,
          size: product.size,
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
      const orderId = await generateOrderId(area, sale.warehouse)
  
      const newOrder = new Order({
        orderId,
        type,
        status: 'pending',
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
        listProduct,
        listPromotions: summary.listPromotion,
        subtotal,
        discount: 0,
        discountProduct: 0,
        vat: 0,
        totalExVat: 0,
        total: subtotal,
        // shipping: {
        //     shippingId: shippingData.shippingId,
        //     address: shippingData.address,
        //     dateRequest: shipping.dateRequest,
        //     note: shipping.note
        // },
        shipping: {
          shippingId: '',
          address: ''
        },
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        createdBy: sale.username
      })
  
      await newOrder.save()
      // await Cart.deleteOne({ type, area, storeId })
  
      const checkIn = await checkInRoute({
        storeId: storeId,
        routeId: routeId,
        orderId: orderId,
        note: note,
        latitude: latitude,
        longitude: longitude
      })
  
      // console.log('checkin', checkIn)
  
      res.status(200).json({
        status: 200,
        message: 'Checkout successful!',
        data: newOrder
      })

    }
    

  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getOrder = async (req, res) => {
  try {
    const { type, area, store, period } = req.query
    let response = []

    if (!type || !area || !period) {
      return res
        .status(400)
        .json({ status: 400, message: 'type, area, period are required!' })
    }

    const { startDate, endDate } = rangeDate(period)

    let query = {
      type,
      'store.area': area,
      createdAt: { $gte: startDate, $lt: endDate }
    }

    if (store) {
      query['store.storeId'] = store
    }

    const order = await Order.find(query)
      .select(
        'orderId store.createdAt store.storeId store.name store.address total status'
      )
      .lean()

    if (!order || order.length === 0) {
      return res.status(404).json({
        status: 404,
        message: 'No orders found!',
        data: []
      })
    }

    response = order.map(o => ({
      orderId: o.orderId,
      storeId: o.store?.storeId || '',
      storeName: o.store?.name || '',
      storeAddress: o.store?.address || '',
      createAt: o.createdAt,
      total: o.total,
      status: o.status
    }))

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

    const order = await Order.findOne({ orderId })

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

    const order = await Order.findOne({ orderId })
    if (!order) {
      return res.status(404).json({ status: 404, message: 'Order not found!' })
    }

    if (order.status !== 'pending' && status !== 'canceled') {
      return res
        .status(400)
        .json({
          status: 400,
          message: 'Cannot update status, order is not in pending state!'
        })
    }

    let newOrderId = orderId

    if (status === 'canceled' && !orderId.endsWith('CC')) {
      newOrderId = `${orderId}CC`

      const isDuplicate = await Order.findOne({ orderId: newOrderId })
      if (isDuplicate) {
        let counter = 1
        while (await Order.findOne({ orderId: `${orderId}CC${counter}` })) {
          counter++
        }
        newOrderId = `${orderId}CC${counter}`
      }
    }

    const updatedOrder = await Order.findOneAndUpdate(
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

exports.addSlip = async (req, res) => {
  try {
    upload(req, res, async err => {
      if (err) {
        return res
          .status(400)
          .json({
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