const { generatePromotionId } = require('../../utilities/genetateId')
const { getRewardProduct } = require('./calculate')
const { Promotion } = require('../../models/cash/promotion')
const { Cart } = require('../../models/cash/cart')
const { Product } = require('../../models/cash/product')

exports.addPromotion = async (req, res) => {
    try {
        const {
            name, description, proType, proCode, coupon,
            applicableTo, except, conditions, rewards, discounts,
            validFrom, validTo
        } = req.body

        if (!name || !proType || !validFrom || !validTo) {
            return res.status(400).json({ status: 400, message: 'Missing required fields!' })
        }

        const proId = await generatePromotionId()

        const newPromotion = new Promotion({
            proId, name, description, proType, proCode, coupon,
            applicableTo, except, conditions, rewards, discounts,
            validFrom, validTo, status: 'active'
        })

        await newPromotion.save()

        res.status(201).json({
            status: 201,
            message: 'Promotion created successfully!',
            data: newPromotion
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ status: '500', message: error.message })
    }
}

exports.getPromotionProduct = async (req, res) => {
    try {
        const { type, storeId, proId } = req.body

        if (!type || !storeId || !proId) {
            return res.status(400).json({ status: 400, message: 'type, storeId, and proId are required!' })
        }

        const cart = await Cart.findOne({ type, storeId }).lean()

        if (!cart || !cart.listPromotion.length) {
            return res.status(404).json({ status: 404, message: 'No applicable promotions found in the cart!' })
        }

        const promotion = cart.listPromotion.find(promo => promo.proId === proId)

        if (!promotion) {
            return res.status(404).json({ status: 404, message: 'Promotion not found in the cart!' })
        }

        const rewardProducts = await getRewardProduct(proId)

        if (!rewardProducts.length) {
            return res.status(404).json({ status: 404, message: 'No reward products found!' })
        }

        const groupedProducts = {}

        rewardProducts.forEach(product => {
            const key = `${product.group}|${product.size}`

            if (!groupedProducts[key]) {
                groupedProducts[key] = {
                    group: product.group,
                    size: product.size,
                    product: []
                }
            }

            groupedProducts[key].product.push({
                id: product.id,
                name: product.name
            })
        })

        const response = {
            proId: promotion.proId,
            name: promotion.proName,
            qty: promotion.proQty,
            listProduct: Object.values(groupedProducts)
        }

        res.status(200).json({
            status: 200,
            message: 'successfully!',
            data: response
        })

    } catch (error) {
        console.error('Error fetching eligible promotion products:', error)
        res.status(500).json({ status: 500, message: 'Server error' })
    }
}

exports.updateCartPromotion = async (req, res) => {
    try {
        const { type, area, storeId, proId, productId, qty } = req.body

        if (!type || !area || !storeId || !proId || !productId || qty === undefined) {
            return res.status(400).json({ status: 400, message: 'Missing required fields!' })
        }

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

        let promoProduct = promotion.listProduct.find((p) => p.id === productId)
        if (!promoProduct) {
            return res.status(404).json({ status: 404, message: 'Product is not in promotion list!' })
        }

        const matchingUnit = product.listUnit.find(unit => unit.unit === promoProduct.unit)
        if (!matchingUnit) {
            return res.status(400).json({ status: 400, message: `Unit '${promoProduct.unit}' not found for this product!` })
        }

        if (qty > promotion.proQty) {
            return res.status(400).json({
                status: 400,
                message: `Cannot update quantity more than allowed promotion limit (${promotion.proQty})`
            })
        }

        promoProduct.qty = qty
        promoProduct.unit = matchingUnit.unit
        promoProduct.unitName = matchingUnit.name

        await cart.save()

        res.status(200).json({
            status: 200,
            message: 'Promotion updated successfully!',
            data: cart.listPromotion
        })

    } catch (error) {
        console.error('Error updating promotion in cart:', error)
        res.status(500).json({ status: 500, message: error.message })
    }
}
