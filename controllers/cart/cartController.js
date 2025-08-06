const crypto = require('crypto')
const { Cart } = require('../../models/cash/cart')
const { Product } = require('../../models/cash/product')
const { Stock } = require('../../models/cash/stock')
const { applyPromotion, applyQuota } = require('../promotion/calculate')
const {
  to2,
  getQty,
  updateStockMongo,
  getPeriodFromDate
} = require('../../middleware/order')
const {
  summaryOrder,
  summaryWithdraw,
  summaryRefund,
  summaryGive,
  summaryAjustStock
} = require('../../utilities/summary')
const { forEach, chain } = require('lodash')
const { error } = require('console')
const cartModel = require('../../models/cash/cart')
const productModel = require('../../models/cash/product')
const stockModel = require('../../models/cash/stock')
const { getModelsByChannel } = require('../../middleware/channel')
const { getSocket } = require('../../socket')
const { period } = require('../../utilities/datetime')

exports.getCart = async (req, res) => {
  // const session = await require('mongoose').startSession();
  try {
    const channel = req.headers['x-channel']
    const { Cart } = getModelsByChannel(channel, res, cartModel)
    const { type, area, storeId, withdrawId } = req.query

    if (!type || !area) {
      return res.status(400).json({
        status: 400,
        message: 'type, area are required!'
      })
    }

    if ((type === 'sale' || type === 'refund' || type === 'give') && !storeId) {
      return res.status(400).json({
        status: 400,
        message: 'storeId is required for sale or refund or give!'
      })
    }
    // const cartQuery = { type, area, withdrawId }

    const cartQuery =
      type === 'withdraw'
        ? { type, area }
        : type === 'adjuststock'
        ? { type, area, withdrawId }
        : { type, area, storeId }

    // ใช้ session ใน findOne เฉพาะกรณีที่ต้อง update ข้อมูล (กัน dirty read ใน replica set)
    let cart = await Cart.findOne(cartQuery)
    // .session(session);

    if (!cart) {
      return res.status(404).json({ status: 404, message: 'Cart not found!' })
    }

    let summary = {}

    if (type === 'sale') {
      // เปิด transaction
      // session.startTransaction();

      summary = await summaryOrder(cart, channel, res)

      const newCartHashProduct = crypto
        .createHash('md5')
        .update(JSON.stringify(cart.listProduct))
        .digest('hex')
      const newCartHashPromotion = crypto
        .createHash('md5')
        .update(JSON.stringify(cart.listPromotion))
        .digest('hex')

      let shouldRecalculatePromotion =
        cart.cartHashProduct !== newCartHashProduct
      // if (shouldRecalculatePromotion) {
      const promotion = await applyPromotion(summary, channel, res)
      const quota = await applyQuota(summary, channel, res)
      cart.listQuota = quota.appliedPromotions
      cart.listPromotion = promotion.appliedPromotions
      cart.cartHashProduct = newCartHashProduct
      cart.cartHashPromotion = newCartHashPromotion
      summary.listPromotion = cart.listPromotion
      summary.listQuota = quota.appliedPromotions
      await cart.save()

      // await session.commitTransaction();
    }

    if (type === 'withdraw') {
      summary = await summaryWithdraw(cart, channel, res)
    }

    if (type === 'adjuststock') {
      summary = await summaryAjustStock(cart, channel, res)
    }

    if (type === 'refund') {
      summary = await summaryRefund(cart, channel, res)
    }

    if (type === 'give') {
      summary = await summaryGive(cart, channel, res)
    }

    // session.endSession();

    // const io = getSocket()
    // io.emit('cart/get', {})

    res.status(200).json({
      status: '200',
      message: 'success',
      data: [summary]
    })
  } catch (error) {
    // await session.abortTransaction().catch(() => { });
    // session.endSession();
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.addProduct = async (req, res) => {
  try {
    const {
      type,
      area,
      storeId,
      id,
      qty,
      unit,
      condition,
      action,
      expire,
      typeref,
      withdrawId
    } = req.body

    const channel = req.headers['x-channel']
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Stock } = getModelsByChannel(channel, res, stockModel)

    if (!type || !area || !id || !qty || !unit) {
      return res.status(400).json({
        status: 400,
        message: 'type, area, id, qty, and unit are required!'
      })
    }

    if ((type === 'sale' || type === 'refund' || type === 'give') && !storeId) {
      return res.status(400).json({
        status: 400,
        message:
          'storeId is required for sale or refund or give or adjuststock!'
      })
    }

    // if (type === 'adjuststock' && !action ) {
    //   return res.status(400).json({
    //     status: 400,
    //     message: 'action,period is required for adjuststock!'
    //   })
    // }

    const product = await Product.findOne({ id }).lean()
    if (!product) {
      return res
        .status(404)
        .json({ status: 404, message: 'Product not found!' })
    }

    const unitData = product.listUnit.find(u => u.unit === unit)
    if (!unitData) {
      return res.status(400).json({
        status: 400,
        message: `Unit '${unit}' not found for this product!`
      })
    }

    const priceField = type === 'refund' ? 'refund' : 'sale'
    const price = parseFloat(unitData.price[priceField])

    const cartQuery =
      type === 'withdraw'
        ? { type, area }
        : type === 'adjuststock'
        ? { type, area, withdrawId }
        : { type, area, storeId }
    const { Cart } = getModelsByChannel(channel, res, cartModel)

    let cart = await Cart.findOne(cartQuery)

    if (!cart) {
      cart = await Cart.create([
        {
          type,
          withdrawId,
          area,
          ...(type === 'withdraw' ? {} : { storeId }),
          total: 0,
          listProduct: [],
          listRefund: []
        }
      ])
      cart = cart[0]
    }

    // ----- ด้านล่างนี้เหมือนเดิม -----
    if (type === 'refund') {
      if (condition && expire) {
        const existingRefund = cart.listRefund.find(
          p =>
            p.id === id &&
            p.unit === unit &&
            p.condition === condition &&
            p.expireDate === expire
        )
        if (existingRefund && existingRefund.unit === unit) {
          existingRefund.qty += qty
        } else {
          cart.listRefund.push({
            id,
            name: product.name,
            qty,
            unit,
            price,
            condition,
            expireDate: expire
          })
        }
      } else {
        const existingProduct = cart.listProduct.find(
          p => p.id === id && p.unit === unit
        )
        if (existingProduct && existingProduct.unit === unit) {
          existingProduct.qty += qty
        } else {
          cart.listProduct.push({
            id,
            name: product.name,

            qty,
            unit,
            price
          })
        }
      }

      const totalRefund = cart.listRefund.reduce(
        (sum, p) => sum + p.qty * p.price,
        0
      )
      const totalProduct = cart.listProduct.reduce(
        (sum, p) => sum + p.qty * p.price,
        0
      )
      cart.total = totalProduct - totalRefund
      cart.total = to2(cart.total)
    } else if (type === 'adjuststock') {
      const existingProduct = cart.listProduct.find(
        p => p.id === id && p.unit === unit && p.action === action
      )
      if (existingProduct && existingProduct.unit === unit) {
        existingProduct.qty += qty
      } else {
        cart.listProduct.push({
          id,
          name: product.name,
          qty,
          unit,
          price,
          action
        })
      }

      cart.total = cart.listProduct.reduce((sum, p) => sum + p.qty * p.price, 0)
      cart.total = to2(cart.total)
    } else {
      const existingProduct = cart.listProduct.find(
        p => p.id === id && p.unit === unit
      )
      if (existingProduct && existingProduct.unit === unit) {
        existingProduct.qty += qty
      } else {
        cart.listProduct.push({
          id,
          name: product.name,
          qty,
          unit,
          price,
          condition
        })
      }

      cart.total = cart.listProduct.reduce((sum, p) => sum + p.qty * p.price, 0)
      cart.total = to2(cart.total)
    }
    cart.createdAt = new Date()

    // ---------- ส่วนสำคัญที่ต้องแก้ไข ------------
    const qtyProduct = { id: id, qty: qty, unit: unit, condition }
    const period = getPeriodFromDate(cart.createdAt)

    // =========== NEW LOGIC เลือก stockType ให้ updateStockMongo ===========

    let stockType = ''
    if (type === 'sale' || type === 'give' || typeref === 'change') {
      stockType = 'OUT' // เพิ่มใน cart คือลดของใน stock จริง
    } else if (type === 'adjuststock') {
      // สมมติ action มีค่าเป็น 'IN' หรือ 'OUT'
      stockType = action || '' // กำหนดตาม action ที่รับเข้ามา
    } else {
      stockType = 'OUT' // default เป็น OUT (กรณี add ใน cart)
    }
    if (typeref === 'change') {
      const updateResult = await updateStockMongo(
        qtyProduct,
        area,
        period,
        'addproduct',
        channel,
        stockType, // ส่ง stockType เข้าไปด้วย!
        res
      )
      if (updateResult) return
    }

    if (type !== 'withdraw' && type !== 'refund' && type != 'adjuststock') {
      const updateResult = await updateStockMongo(
        qtyProduct,
        area,
        period,
        'addproduct',
        channel,
        stockType, // ส่ง stockType เข้าไปด้วย!
        res
      )
      if (updateResult) return
    }

    await cart.save()

    // const io = getSocket()
    // io.emit('cart/add', {})

    res.status(200).json({
      status: 200,
      message: 'Product added successfully!',
      data: cart
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.adjustProduct = async (req, res) => {
  try {
    const {
      type,
      area,
      storeId,
      id,
      unit,
      qty,
      condition,
      expire,
      stockType,
      withdrawId
    } = req.body
    const channel = req.headers['x-channel']
    const { Cart } = getModelsByChannel(channel, res, cartModel)

    // Validation
    if (!type || !area || !id || !unit || qty === undefined) {
      return res.status(400).json({
        status: 400,
        message: 'type, area, id, unit, and qty are required!'
      })
    }
    if ((type === 'sale' || type === 'refund' || type === 'give') && !storeId) {
      return res.status(400).json({
        status: 400,
        message: 'storeId is required for sale, refund, or give!'
      })
    }

    // Find Cart
    const cartQuery =
      type === 'withdraw'
        ? { type, area }
        : type === 'adjuststock'
        ? { type, area, withdrawId }
        : { type, area, storeId }

    let cart = await Cart.findOne(cartQuery)
    if (!cart) {
      return res.status(404).json({ status: 404, message: 'Cart not found!' })
    }
    const period = getPeriodFromDate(cart.createdAt)

    // --- STEP 1: หาค่า qty เดิมใน cart

    if (condition) {
      idx = cart.listRefund.findIndex(
        p => p.id === id && p.unit === unit && p.condition === condition
      )
      if (idx === -1) {
        return res
          .status(404)
          .json({ status: 404, message: 'Product not found in cart refund!' })
      }
      oldQty = cart.listRefund[idx].qty
    } else {
      idx = cart.listProduct.findIndex(p => p.id === id && p.unit === unit)
      if (idx === -1) {
        return res
          .status(404)
          .json({ status: 404, message: 'Product not found in cart!' })
      }
      oldQty = cart.listProduct[idx].qty
    }

    // --- STEP 2: คำนวณ delta ระหว่าง qty ใหม่ (user ส่งมา) กับ qty เดิม (ที่อยู่ใน cart)
    const delta = qty - oldQty

    // console.log(delta)
    // --- STEP 3: ถ้าไม่มีการเปลี่ยนแปลง
    if (delta === 0) {
      return res
        .status(200)
        .json({ status: 200, message: 'No changes made', data: cart })
    }

    // --- STEP 4: อัพเดต stock ตาม delta
    let updateResult = null
    if (type === 'sale' || type === 'give') {
      if (delta !== 0) {
        const qtyProductStock = { id, qty: Math.abs(delta), unit }
        // เพิ่มใน cart (OUT = หักจาก stock) | ลดใน cart (IN = คืนเข้า stock)
        const adjStockType = delta > 0 ? 'OUT' : 'IN'
        updateResult = await updateStockMongo(
          qtyProductStock,
          area,
          period,
          'adjust',
          channel,
          adjStockType,
          res
        )
        if (updateResult) return // (กรณี stock ไม่พอ)
      }
    } else if (type === 'withdraw') {
      // const qtyProductStock = { id, qty: Math.abs(delta), unit }
      // // เพิ่มใน cart (OUT = หักจาก stock) | ลดใน cart (IN = คืนเข้า stock)
      // const adjStockType = delta > 0 ? 'OUT' : 'IN'
      // updateResult = await updateStockMongo(
      //   qtyProductStock,
      //   area,
      //   period,
      //   'adjust',
      //   channel,
      //   adjStockType,
      //   res
      // )
      // if (updateResult) return // (กรณี stock ไม่พอ)
    } else if (type === 'withdraw') {
    }

    // --- STEP 5: อัพเดตจำนวนใน cart ให้ตรงกับ qty ล่าสุด

    if (condition) {
      if (qty === 0) {
        cart.listRefund.splice(idx, 1) // Remove item
      } else {
        cart.listRefund[idx].qty = qty
      }

      cart.total = cart.listRefund.reduce(
        (sum, item) => sum + item.qty * item.price,
        0
      )
    } else {
      if (qty === 0) {
        cart.listProduct.splice(idx, 1) // Remove item
      } else {
        cart.listProduct[idx].qty = qty
      }

      cart.total = cart.listProduct.reduce(
        (sum, item) => sum + item.qty * item.price,
        0
      )
    }
    await cart.save()

    // --- STEP 7: Emit socket & return
    const io = getSocket()
    io.emit('cart/adjust', {})

    return res.status(200).json({
      status: 200,
      message: 'Cart updated successfully!',
      data: cart
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
}

exports.deleteProduct = async (req, res) => {
  // const session = await require('mongoose').startSession();
  // session.startTransaction();
  try {
    const { type, area, storeId, id, unit, condition, expire } = req.body
    const channel = req.headers['x-channel']

    if (!type || !area || !id || !unit) {
      // await session.abortTransaction();
      // session.endSession();
      return res.status(400).json({
        status: 400,
        message: 'type, area, id, and unit are required!'
      })
    }

    if ((type === 'sale' || type === 'refund' || type === 'give') && !storeId) {
      // await session.abortTransaction();
      // session.endSession();
      return res.status(400).json({
        status: 400,
        message: 'storeId is required for sale or refund or give!'
      })
    }

    const cartQuery =
      type === 'withdraw' ? { type, area } : { type, area, storeId }
    const { Cart } = getModelsByChannel(channel, res, cartModel)

    let cart = await Cart.findOne(cartQuery)
    // .session(session);
    if (!cart) {
      // await session.abortTransaction();
      // session.endSession();
      return res.status(404).json({ status: 404, message: 'Cart not found!' })
    }

    let updated = false
    // console.log(type,condition)
    if ((type === 'refund' && condition) || expire) {
      const refundIndex = cart.listRefund.findIndex(
        p =>
          p.id === id &&
          p.unit === unit &&
          p.condition === condition &&
          p.expireDate === expire
      )
      if (refundIndex === -1) {
        // await session.abortTransaction();
        // session.endSession();
        return res
          .status(404)
          .json({ status: 404, message: 'Product not found in refund list!' })
      }

      const refundProduct = cart.listRefund[refundIndex]
      cart.listRefund.splice(refundIndex, 1)
      cart.total -= refundProduct.qty * refundProduct.price
      updated = true
    } else if (type === 'refund' && !condition && !expire) {
      const productIndex = cart.listProduct.findIndex(
        p => p.id === id && p.unit === unit
      )
      if (productIndex === -1) {
        // await session.abortTransaction();
        // session.endSession();
        return res
          .status(404)
          .json({ status: 404, message: 'Product not found in cart!' })
      }

      product = cart.listProduct[productIndex]
      cart.listProduct.splice(productIndex, 1)
      cart.total += product.qty * product.price
      updated = true
    } else {
      const productIndex = cart.listProduct.findIndex(
        p => p.id === id && p.unit === unit
      )
      if (productIndex === -1) {
        // await session.abortTransaction();
        // session.endSession();
        return res
          .status(404)
          .json({ status: 404, message: 'Product not found in cart!' })
      }

      product = cart.listProduct[productIndex]
      cart.listProduct.splice(productIndex, 1)
      cart.total -= product.qty * product.price
      updated = true

      // console.log(product)
    }

    const period = getPeriodFromDate(cart.createdAt)
    if (type != 'withdraw' && type != 'adjuststock') {
      // await updateStockMongo(product, area, period, 'deleteCart', channel)
      // console.log(type)
      const updateResult = await updateStockMongo(
        product,
        area,
        period,
        'deleteCart',
        channel,
        res
      )
      if (updateResult) return
    }

    if (cart.listProduct.length === 0 && cart.listRefund.length === 0) {
      await Cart.deleteOne(cartQuery)
      // await session.commitTransaction();
      // session.endSession();
      return res.status(200).json({
        status: 200,
        message: 'Cart deleted successfully!'
      })
    }

    if (updated) {
      await cart.save()
    }

    // await session.commitTransaction();
    // session.endSession();

    const io = getSocket()
    io.emit('cart/delete', {})

    res.status(200).json({
      status: 200,
      message: 'Product removed successfully!',
      data: cart
    })
  } catch (error) {
    // await session.abortTransaction().catch(() => { });
    // session.endSession();
    console.error(error)
    res.status(500).json({ status: 500, message: error.message })
  }
}

exports.updateCartPromotion = async (req, res) => {
  // ยังไม่เป็นว่าเคยใช้
  // const session = await require('mongoose').startSession();
  // session.startTransaction();
  try {
    const { type, area, storeId, proId, productId, qty } = req.body
    const channel = req.headers['x-channel']

    const { Cart } = getModelsByChannel(channel, res, cartModel)

    let cart = await Cart.findOne({ type, area, storeId })
    // .session(session);

    if (!cart) {
      // await session.abortTransaction();
      // session.endSession();
      return res.status(404).json({ status: 404, message: 'Cart not found!' })
    }

    let promotion = cart.listPromotion.find(promo => promo.proId === proId)

    if (!promotion) {
      // await session.abortTransaction();
      // session.endSession();
      return res
        .status(404)
        .json({ status: 404, message: 'Promotion not found!' })
    }

    const { Product } = getModelsByChannel(channel, res, productModel)

    const product = await Product.findOne({ id: productId }).lean()

    if (!product) {
      // await session.abortTransaction();
      // session.endSession();
      return res
        .status(404)
        .json({ status: 404, message: 'Product not found!' })
    }

    const matchingUnit = product.listUnit.find(
      unit => unit.unit === promotion.unit
    )

    if (!matchingUnit) {
      // await session.abortTransaction();
      // session.endSession();
      return res.status(400).json({
        status: 400,
        message: `Unit '${promotion.unit}' not found for this product!`
      })
    }

    // อัปเดตข้อมูลใน promotion
    promotion.id = product.id
    promotion.group = product.group
    promotion.flavour = product.flavour
    promotion.brand = product.brand
    promotion.size = product.size
    promotion.unit = matchingUnit.unit
    promotion.qty = promotion.qty // ดูเหมือนจะไม่เปลี่ยนค่า แต่ถ้าต้องการให้รับจาก req.body ให้เปลี่ยนเป็น qty

    await cart.save()

    // await session.commitTransaction();
    // session.endSession();

    const io = getSocket()
    io.emit('cart/updateStock', {})

    res.status(200).json({
      status: '200',
      message: 'Promotion updated successfully!',
      data: cart.listPromotion
    })
  } catch (error) {
    // await session.abortTransaction().catch(() => { });
    // session.endSession();
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.updateStock = async (req, res) => {
  // const session = await require('mongoose').startSession();
  // session.startTransaction();
  try {
    const { area, productId, period, unit, type } = req.body
    let { qty } = req.body
    const channel = req.headers['x-channel']

    const { Stock } = getModelsByChannel(channel, res, stockModel)
    const { Product } = getModelsByChannel(channel, res, productModel)

    const stockDoc = await Stock.findOne({
      area: area,
      period: period
    })
    // .session(session);

    if (!stockDoc) {
      // await session.abortTransaction();
      // session.endSession();
      return res.status(404).json({
        status: 404,
        message: 'Stock document not found for this area and period'
      })
    }

    const productStock = stockDoc.listProduct.find(
      p => p.productId === productId
    )

    if (!productStock) {
      // await session.abortTransaction();
      // session.endSession();
      return res.status(404).json({
        status: 404,
        message: 'Product not found in stock'
      })
    }

    const modelProduct = await Product.findOne({ id: productId })
    // .session(session);

    if (!modelProduct) {
      // await session.abortTransaction();
      // session.endSession();
      return res.status(404).json({
        status: 404,
        message: 'Product not found'
      })
    }

    // Convert to PCS if needed
    if (unit !== 'PCS') {
      const unitData = modelProduct.listUnit.find(u => u.unit === unit)
      if (!unitData) {
        // await session.abortTransaction();
        // session.endSession();
        return res.status(400).json({
          status: 400,
          message: 'Invalid unit for this product'
        })
      }
      qty = parseInt(unitData.factor) * qty
    }
    // Update based on IN or OUT
    if (type === 'IN') {
      productStock.stockInPcs += qty
      productStock.balancePcs += qty
    } else if (type === 'OUT') {
      productStock.stockOutPcs += qty
      productStock.balancePcs -= qty
    } else {
      // await session.abortTransaction();
      // session.endSession();
      return res.status(400).json({
        status: 400,
        message: 'Invalid type. Must be IN or OUT'
      })
    }

    // Calculate CTN values from PCS using factor
    const ctnUnit = modelProduct.listUnit.find(u => u.unit === 'CTN')
    const factor = ctnUnit ? parseInt(ctnUnit.factor) : null

    if (factor) {
      productStock.stockInCtn = Math.floor(productStock.stockInPcs / factor)
      productStock.stockOutCtn = Math.floor(productStock.stockOutPcs / factor)
      productStock.balanceCtn = Math.floor(productStock.balancePcs / factor)
    }

    // console.log(productStock)
    // Save updated document
    await stockDoc.save()

    // await session.commitTransaction();
    // session.endSession();

    const io = getSocket()
    io.emit('cart/updateStock', {})

    res.status(200).json({
      status: 200,
      message: 'Stock updated successfully',
      data: productStock
    })
  } catch (error) {
    // await session.abortTransaction().catch(() => { });
    // session.endSession();
    console.error('[updateStock Error]', error)
    res.status(500).json({ status: 500, message: error.message })
  }
}
