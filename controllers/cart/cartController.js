const crypto = require('crypto')
const { Cart } = require('../../models/cash/cart')
const { Product } = require('../../models/cash/product')
const { applyPromotion } = require('../promotion/calculate')
const { summaryOrder, summaryWithdraw, summaryRefund, summaryGive } = require('../../utilities/summary')

exports.getCart = async (req, res) => {
    try {
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

        const cartQuery = type === 'withdraw'
            ? { type, area }
            : { type, area, storeId }

        let cart = await Cart.findOne(cartQuery)

        if (!cart) {
            return res.status(404).json({ status: 404, message: 'Cart not found!' })
        }

        let summary = {}
        if (type === 'sale') {
            summary = await summaryOrder(cart)

            const newCartHashProduct = crypto.createHash('md5').update(JSON.stringify(cart.listProduct)).digest('hex')
            const newCartHashPromotion = crypto.createHash('md5').update(JSON.stringify(cart.listPromotion)).digest('hex')

            let shouldRecalculatePromotion = cart.cartHashProduct !== newCartHashProduct

            // if (shouldRecalculatePromotion) {
                const promotion = await applyPromotion(summary)
                cart.listPromotion = promotion.appliedPromotions
                cart.cartHashProduct = newCartHashProduct
                cart.cartHashPromotion = newCartHashPromotion
                await cart.save()
            // }
            summary.listPromotion = cart.listPromotion
        }

        if (type === 'withdraw') {
            summary = await summaryWithdraw(cart)
        }

        if (type === 'refund') {
            summary = await summaryRefund(cart)
        }

        if (type === 'give') {
            summary = await summaryGive(cart)
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
        const { type, area, storeId, id, qty, unit, condition, expire } = req.body

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
            return res.status(404).json({ status: 404, message: 'Product not found!' })
        }

        const unitData = product.listUnit.find((u) => u.unit === unit)
        if (!unitData) {
            return res.status(400).json({ status: 400, message: `Unit '${unit}' not found for this product!` })
        }

        const priceField = type === 'refund' ? 'refund' : 'sale'
        const price = parseFloat(unitData.price[priceField])

        const cartQuery = type === 'withdraw'
            ? { type, area }
            : { type, area, storeId }

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
                const existingRefund = cart.listRefund.find(p => p.id === id && p.unit === unit && p.condition === condition && p.expireDate === expire)
                if (existingRefund) {
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
                const existingProduct = cart.listProduct.find(p => p.id === id && p.unit === unit)
                if (existingProduct) {
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

            const totalRefund = cart.listRefund.reduce((sum, p) => sum + (p.qty * p.price), 0)
            const totalProduct = cart.listProduct.reduce((sum, p) => sum + (p.qty * p.price), 0)
            cart.total = totalProduct - totalRefund

        } else {
            const existingProduct = cart.listProduct.find(p => p.id === id && p.unit === unit)
            if (existingProduct) {
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

            cart.total = cart.listProduct.reduce((sum, p) => sum + (p.qty * p.price), 0)
        }
        cart.createdAt = new Date()
        await cart.save()

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

        const cartQuery = type === 'withdraw'
            ? { type, area }
            : { type, area, storeId }

        let cart = await Cart.findOne(cartQuery)
        if (!cart) {
            return res.status(404).json({ status: 404, message: 'Cart not found!' })
        }

        let updated = false

        if (type === 'refund' && condition !== undefined && expire !== undefined) {
            const existingRefundIndex = cart.listRefund.findIndex((p) => p.id === id && p.unit === unit && p.condition === condition && p.expireDate === expire)

            if (existingRefundIndex === -1) {
                return res.status(404).json({ status: 404, message: 'Refund product not found in cart!' })
            }

            if (qty === 0) {
                cart.listRefund.splice(existingRefundIndex, 1)
            } else {
                cart.listRefund[existingRefundIndex].qty = qty
            }
            updated = true
        } else {
            const existingProductIndex = cart.listProduct.findIndex((p) => p.id === id && p.unit === unit)

            if (existingProductIndex === -1) {
                return res.status(404).json({ status: 404, message: 'Product not found in cart!' })
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
                cart.total = cart.listRefund.reduce((sum, item) => sum + (item.qty * item.price), 0)
                    - cart.listProduct.reduce((sum, item) => sum + (item.qty * item.price), 0)
            } else {
                cart.total = cart.listProduct.reduce((sum, item) => sum + (item.qty * item.price), 0)
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

        const cartQuery = type === 'withdraw'
            ? { type, area }
            : { type, area, storeId }

        let cart = await Cart.findOne(cartQuery)
        if (!cart) {
            return res.status(404).json({ status: 404, message: 'Cart not found!' })
        }

        let updated = false

        if (type === 'refund' && condition || expire) {
            const refundIndex = cart.listRefund.findIndex(p => p.id === id && p.unit === unit && p.condition === condition && p.expireDate === expire)
            if (refundIndex === -1) {
                return res.status(404).json({ status: 404, message: 'Product not found in refund list!' })
            }

            const refundProduct = cart.listRefund[refundIndex]
            cart.listRefund.splice(refundIndex, 1)
            cart.total -= refundProduct.qty * refundProduct.price
            updated = true
        } else if (type === 'refund' && !condition && !expire) {
            const productIndex = cart.listProduct.findIndex(p => p.id === id && p.unit === unit)
            if (productIndex === -1) {
                return res.status(404).json({ status: 404, message: 'Product not found in cart!' })
            }

            const product = cart.listProduct[productIndex]
            cart.listProduct.splice(productIndex, 1)
            cart.total += product.qty * product.price
            updated = true
        } else {
            const productIndex = cart.listProduct.findIndex(p => p.id === id && p.unit === unit)
            if (productIndex === -1) {
                return res.status(404).json({ status: 404, message: 'Product not found in cart!' })
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

    try {
        let cart = await Cart.findOne({ type, area, storeId })

        if (!cart) {
            return res.status(404).json({ status: 404, message: 'Cart not found!' })
        }

        let promotion = cart.listPromotion.find((promo) => promo.proId === proId)

        if (!promotion) {
            return res.status(404).json({ status: 404, message: 'Promotion not found!' })
        }

        const product = await Product.findOne({ id: productId }).lean()

        if (!product) {
            return res.status(404).json({ status: 404, message: 'Product not found!' })
        }

        const matchingUnit = product.listUnit.find(unit => unit.unit === promotion.unit)

        if (!matchingUnit) {
            return res.status(400).json({ status: 400, message: `Unit '${promotion.unit}' not found for this product!` })
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