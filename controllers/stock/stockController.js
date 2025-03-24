const { Stock } = require('../../models/cash/stock')
const { User } = require('../../models/cash/user')
const { Product } = require('../../models/cash/product')
const { getStockAvailable } = require('./available')
const { getStockMovement } = require('../../utilities/movement')

exports.addStock = async (req, res) => {
    try {
        const body = req.body

        if (!Array.isArray(body)) {
            return res.status(400).json({ status: 400, message: 'Invalid format: expected an array' })
        }

        for (const item of body) {
            const { area, period, listProduct } = item

            if (!area || !Array.isArray(listProduct)) continue

            const user = await User.findOne({ area }).select('saleCode').lean()
            if (!user) continue

            const saleCode = user.saleCode

            let enrichedListProduct = []

            for (const productEntry of listProduct) {
                const { productId, available } = productEntry

                const productInfo = await Product.findOne({ id: productId }).lean()
                if (!productInfo) continue

                enrichedListProduct.push({
                    productId,
                    productName: productInfo.name || '',
                    productGroup: productInfo.group || '',
                    productFlavour: productInfo.flavour || '',
                    productSize: productInfo.size || '',
                    available: Array.isArray(available) ? available : []
                })
            }

            if (enrichedListProduct.length > 0) {
                const stockDoc = new Stock({
                    area,
                    saleCode,
                    period,
                    listProduct: enrichedListProduct
                })
                await stockDoc.save()
            }
        }

        res.status(200).json({
            status: 200,
            message: 'Stock added successfully',
        })

    } catch (error) {
        console.error('Error adding stock:', error)
        res.status(500).json({ status: 500, message: error.message })
    }
}

exports.available = async (req, res) => {
    try {
        const { area, period } = req.query
        const data = await getStockAvailable(area, period)
        res.status(200).json({
            status: 200,
            message: 'successfully',
            data: data
        })
    } catch (error) {
        console.error('Error available stock:', error)
        res.status(500).json({ status: 500, message: error.message })
    }
}

exports.transaction = async (req, res) => {
    try {
        const { area, period } = req.query
        const movement = await getStockMovement(area, period)
        res.status(200).json({
            status: 200,
            message: 'successfully!',
            data: movement
        })
    } catch (error) {
        console.error('Error updating order:', error)
        res.status(500).json({ status: 500, message: 'Server error' })
    }
}