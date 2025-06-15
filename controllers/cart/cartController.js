const crypto = require('crypto')
const { Cart } = require('../../models/cash/cart')
const { Product } = require('../../models/cash/product')
const { Stock } = require('../../models/cash/stock')
const { applyPromotion, applyQuota } = require('../promotion/calculate')
const {
  summaryOrder,
  summaryWithdraw,
  summaryRefund,
  summaryGive
} = require('../../utilities/summary')
const { forEach } = require('lodash')
const { error } = require('console')
const cartModel = require('../../models/cash/cart')
const productModel = require('../../models/cash/product')
const stockModel = require('../../models/cash/stock')
const { getModelsByChannel } = require('../../middleware/channel')

exports.getCart = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { Cart } = getModelsByChannel(channel, res, cartModel)

    const { type, area, storeId } = req.query

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

    const cartQuery =
      type === 'withdraw' ? { type, area } : { type, area, storeId }

    let cart = await Cart.findOne(cartQuery)

    if (!cart) {
      return res.status(404).json({ status: 404, message: 'Cart not found!' })
    }

    let summary = {}
    if (type === 'sale') {
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
      // console.log(summary)
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
      // }

      // console.log(JSON.stringify(summary.listQuota, null, 2));
    }

    if (type === 'withdraw') {
      summary = await summaryWithdraw(cart, channel, res)
    }

    if (type === 'refund') {
      summary = await summaryRefund(cart, channel, res)
    }

    if (type === 'give') {
      summary = await summaryGive(cart, channel, res)
    }

    res.status(200).json({
      status: '200',
      message: 'success',
      data: [summary]
    })
  } catch (error) {
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
      expire
      // lot
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
        message: 'storeId is required for sale or refund or give!'
      })
    }

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
      type === 'withdraw' ? { type, area } : { type, area, storeId }
    const { Cart } = getModelsByChannel(channel, res, cartModel)

    let cart = await Cart.findOne(cartQuery)

    if (!cart) {
      cart = await Cart.create({
        type,
        area,
        ...(type === 'withdraw' ? {} : { storeId }),
        total: 0,
        listProduct: [],
        listRefund: []
      })
    }

    if (type === 'refund') {
      if (condition && expire) {
        const existingRefund = cart.listRefund.find(
          p =>
            p.id === id &&
            p.unit === unit &&
            // p.lot === lot &&
            p.condition === condition &&
            p.expireDate === expire
        )
        if (
          existingRefund &&
          // existingRefund.lot === lot &&
          existingRefund.unit === unit
        ) {
          existingRefund.qty += qty
        } else {
          cart.listRefund.push({
            id,
            // lot,
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
          // && p.lot === lot
        )
        if (
          existingProduct &&
          // existingProduct.lot === lot &&
          existingProduct.unit === unit
        ) {
          existingProduct.qty += qty
        } else {
          cart.listProduct.push({
            id,
            // lot,
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
    } else {
      // console.log(cart.listProduct)
      const existingProduct = cart.listProduct.find(
        p => p.id === id && p.unit === unit
        // && p.lot === lot
      )
      // console.log(JSON.stringify(existingProduct, null, 2));
      if (
        existingProduct &&
        // existingProduct.lot === lot &&
        existingProduct.unit === unit
      ) {
        existingProduct.qty += qty
      } else {
        // console.log("test")
        cart.listProduct.push({
          id,
          // lot,
          name: product.name,
          qty,
          unit,
          price,
          condition
        })
      }

      cart.total = cart.listProduct.reduce((sum, p) => sum + p.qty * p.price, 0)
    }
    cart.createdAt = new Date()
    // const period = "202506"
    await cart.save()

    //// ยังไม่ใช้จริง กำลัง Test

    // const stock = await Stock.aggregate([
    //   { $match: { area: area, period: period } },
    //   { $unwind: { path: '$listProduct', preserveNullAndEmptyArrays: true } },
    //   { $match: { "listProduct.productId": { $in: productId } } },
    //   {
    //     $project: {
    //       _id: 0,
    //       productId: "$listProduct.productId",
    //       stockPcs: "$listProduct.stockPcs",
    //       stockInPcs: "$listProduct.stockInPcs",
    //       stockOutPcs: "$listProduct.stockOutPcs",
    //       balancePcs: "$listProduct.balancePcs",
    //       stockCtn: "$listProduct.stockCtn",
    //       stockInCtn: "$listProduct.stockInCtn",
    //       stockOutCtn: "$listProduct.stockOutCtn",
    //       balanceCtn: "$listProduct.balanceCtn"
    //     }
    //   }
    // ]);
    // console.log(stock)
    // if (type == 'sale') {
    //   for (const stockDetail of stock) {
    //     for (const lot of stockDetail.available) {
    //       const calDetails = cart.listProduct.filter(
    //         u => u.id === stockDetail.productId && u.lot === lot.lot
    //       );
    //       let pcsQty = 0;
    //       let ctnQty = 0;
    //       for (const cal of calDetails) {
    //         if (cal.unit === 'PCS' || cal.unit === 'BOT') {
    //           pcsQty += cal.qty || 0;
    //         }
    //         if (cal.unit === 'CTN') {
    //           ctnQty += cal.qty || 0;
    //         }
    //       }
    //       checkQtyPcs = lot.qtyPcs - pcsQty
    //       checkQtyCtn = lot.qtyCtn - ctnQty
    //       if (checkQtyPcs < 0 || checkQtyCtn < 0) {
    //         return res.status(400).json({
    //           status: 400,
    //           message: `This lot ${lot.lot} is not enough to sale`
    //         })
    //       }
    //     }
    //   }
    // }
    // else if (type == 'give') {
    //   for (const stockDetail of stock) {
    //     for (const lot of stockDetail.available) {
    //       const calDetails = calStock.product.filter(
    //         u => u.productId === stockDetail.productId && u.lot === lot.lot
    //       );
    //       let pcsQty = 0;
    //       let ctnQty = 0;
    //       for (const cal of calDetails) {
    //         if (cal.unit === 'PCS' || cal.unit === 'BOT') {
    //           pcsQty += cal.qty || 0;
    //         }
    //         if (cal.unit === 'CTN') {
    //           ctnQty += cal.qty || 0;
    //         }
    //       }
    //       checkQtyPcs = lot.qtyPcs - pcsQty
    //       checkQtyCtn = lot.qtyCtn - ctnQty
    //       if (checkQtyPcs < 0 || checkQtyCtn < 0) {
    //         return res.status(400).json({
    //           status: 400,
    //           message: `This lot ${lot.lot} is not enough to give`
    //         })
    //       }
    //     }
    //   }
    // }
    // else if (type == 'refund') {
    //   for (const stockDetail of stock) {
    //     for (const lot of stockDetail.available) {
    //       const calDetails = calStock.product.filter(
    //         u => u.productId === stockDetail.productId && u.lot === lot.lot
    //       );
    //       let pcsQtyGood = 0;
    //       let pcsQtyDamaged = 0;
    //       let ctnQtyGood = 0;
    //       let ctnQtyDamaged = 0;
    //       for (const cal of calDetails) {
    //         if ((cal.unit === 'PCS' || cal.unit === 'BOT') && cal.condition === 'good') {
    //           pcsQtyGood += cal.qty || 0;
    //         }
    //         if ((cal.unit === 'PCS' || cal.unit === 'BOT') && cal.condition === 'damaged') {
    //           pcsQtyDamaged += cal.qty || 0;
    //         }
    //         if (cal.unit === 'CTN' && cal.condition === 'good') {
    //           ctnQtyGood += cal.qty || 0;
    //         }
    //         if (cal.unit === 'CTN' && cal.condition === 'damaged') {
    //           ctnQtyDamaged += cal.qty || 0;
    //         }
    //       }
    //       checkQtyPcs = lot.qtyPcs + pcsQtyGood - pcsQtyDamaged
    //       checkQtyCtn = lot.qtyCtn + ctnQtyGood - ctnQtyDamaged
    //       if (checkQtyPcs < 0 || checkQtyCtn < 0) {
    //         return res.status(400).json({
    //           status: 400,
    //           message: `This lot ${lot.lot} is not enough to refund`
    //         })
    //       }
    //     }
    //   }
    // }

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
    const { type, area, storeId, id, unit, qty, condition, expire } = req.body
    const channel = req.headers['x-channel']

    const { Cart } = getModelsByChannel(channel, res, cartModel)

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

    const cartQuery =
      type === 'withdraw' ? { type, area } : { type, area, storeId }

    let cart = await Cart.findOne(cartQuery)
    if (!cart) {
      return res.status(404).json({ status: 404, message: 'Cart not found!' })
    }

    let updated = false

    if (type === 'refund' && condition !== undefined && expire !== undefined) {
      const existingRefundIndex = cart.listRefund.findIndex(
        p =>
          p.id === id &&
          p.unit === unit &&
          p.condition === condition &&
          p.expireDate === expire
      )

      if (existingRefundIndex === -1) {
        return res
          .status(404)
          .json({ status: 404, message: 'Refund product not found in cart!' })
      }

      if (qty === 0) {
        cart.listRefund.splice(existingRefundIndex, 1)
      } else {
        cart.listRefund[existingRefundIndex].qty = qty
      }
      updated = true
    } else {
      const existingProductIndex = cart.listProduct.findIndex(
        p => p.id === id && p.unit === unit
      )

      if (existingProductIndex === -1) {
        return res
          .status(404)
          .json({ status: 404, message: 'Product not found in cart!' })
      }

      if (qty === 0) {
        cart.listProduct.splice(existingProductIndex, 1)
      } else {
        cart.listProduct[existingProductIndex].qty = qty
      }
      updated = true
    }

    if (updated) {
      if (type === 'refund') {
        cart.total =
          cart.listRefund.reduce(
            (sum, item) => sum + item.qty * item.price,
            0
          ) -
          cart.listProduct.reduce((sum, item) => sum + item.qty * item.price, 0)
      } else {
        cart.total = cart.listProduct.reduce(
          (sum, item) => sum + item.qty * item.price,
          0
        )
      }
    }

    if (cart.listProduct.length === 0 && cart.listRefund.length === 0) {
      await Cart.deleteOne(cartQuery)
      return res.status(200).json({
        status: 200,
        message: 'Cart deleted successfully!',
        data: null
      })
    }

    await cart.save()

    res.status(200).json({
      status: 200,
      message: 'Cart updated successfully!',
      data: cart
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: 500, message: error.message })
  }
}

exports.deleteProduct = async (req, res) => {
  try {
    const { type, area, storeId, id, unit, condition, expire } = req.body

    const channel = req.headers['x-channel']

    if (!type || !area || !id || !unit) {
      return res.status(400).json({
        status: 400,
        message: 'type, area, id, and unit are required!'
      })
    }

    if ((type === 'sale' || type === 'refund' || type === 'give') && !storeId) {
      return res.status(400).json({
        status: 400,
        message: 'storeId is required for sale or refund or give!'
      })
    }

    const cartQuery =
      type === 'withdraw' ? { type, area } : { type, area, storeId }

    const { Cart } = getModelsByChannel(channel, res, cartModel)

    let cart = await Cart.findOne(cartQuery)
    if (!cart) {
      return res.status(404).json({ status: 404, message: 'Cart not found!' })
    }

    let updated = false

    if ((type === 'refund' && condition) || expire) {
      const refundIndex = cart.listRefund.findIndex(
        p =>
          p.id === id &&
          p.unit === unit &&
          p.condition === condition &&
          p.expireDate === expire
      )
      if (refundIndex === -1) {
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
        return res
          .status(404)
          .json({ status: 404, message: 'Product not found in cart!' })
      }

      const product = cart.listProduct[productIndex]
      cart.listProduct.splice(productIndex, 1)
      cart.total += product.qty * product.price
      updated = true
    } else {
      const productIndex = cart.listProduct.findIndex(
        p => p.id === id && p.unit === unit
      )
      if (productIndex === -1) {
        return res
          .status(404)
          .json({ status: 404, message: 'Product not found in cart!' })
      }

      const product = cart.listProduct[productIndex]
      cart.listProduct.splice(productIndex, 1)
      cart.total -= product.qty * product.price
      updated = true
    }

    if (cart.listProduct.length === 0 && cart.listRefund.length === 0) {
      await Cart.deleteOne(cartQuery)
      return res.status(200).json({
        status: 200,
        message: 'Cart deleted successfully!'
      })
    }

    if (updated) {
      await cart.save()
    }

    res.status(200).json({
      status: 200,
      message: 'Product removed successfully!',
      data: cart
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: 500, message: error.message })
  }
}

exports.updateCartPromotion = async (req, res) => {
  const { type, area, storeId, proId, productId, qty } = req.body
  const channel = req.headers['x-channel']

  const { Cart } = getModelsByChannel(channel, res, cartModel)

  try {
    let cart = await Cart.findOne({ type, area, storeId })

    if (!cart) {
      return res.status(404).json({ status: 404, message: 'Cart not found!' })
    }

    let promotion = cart.listPromotion.find(promo => promo.proId === proId)

    if (!promotion) {
      return res
        .status(404)
        .json({ status: 404, message: 'Promotion not found!' })
    }

    const { Product } = getModelsByChannel(channel, res, productModel)

    const product = await Product.findOne({ id: productId }).lean()

    if (!product) {
      return res
        .status(404)
        .json({ status: 404, message: 'Product not found!' })
    }

    const matchingUnit = product.listUnit.find(
      unit => unit.unit === promotion.unit
    )

    if (!matchingUnit) {
      return res.status(400).json({
        status: 400,
        message: `Unit '${promotion.unit}' not found for this product!`
      })
    }

    promotion.id = product.id
    promotion.group = product.group
    promotion.flavour = product.flavour
    promotion.brand = product.brand
    promotion.size = product.size
    promotion.unit = matchingUnit.unit
    promotion.qty = promotion.qty

    await cart.save()

    res.status(200).json({
      status: '200',
      message: 'Promotion updated successfully!',
      data: cart.listPromotion
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}
// check
exports.updateStock = async (req, res) => {
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

    if (!stockDoc) {
      return res.status(404).json({
        status: 404,
        message: 'Stock document not found for this area and period'
      })
    }

    const productStock = stockDoc.listProduct.find(
      p => p.productId === productId
    )

    if (!productStock) {
      return res.status(404).json({
        status: 404,
        message: 'Product not found in stock'
      })
    }

    const modelProduct = await Product.findOne({ id: productId })

    if (!modelProduct) {
      return res.status(404).json({
        status: 404,
        message: 'Product not found'
      })
    }

    // Convert to PCS if needed
    if (unit !== 'PCS') {
      const unitData = modelProduct.listUnit.find(u => u.unit === unit)
      if (!unitData) {
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

    // Save updated document
    await stockDoc.save()

    res.status(200).json({
      status: 200,
      message: 'Stock updated successfully',
      data: productStock
    })
  } catch (error) {
    console.error('[updateStock Error]', error)
    res.status(500).json({ status: 500, message: error.message })
  }
}
