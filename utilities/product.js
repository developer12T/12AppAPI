const { Product } = require('../models/cash/product')

async function getProductDetail(type, id, unit) {
    try {
        if (!type || !id || !unit) {
            throw new Error('type, id และ unit เป็นค่าที่จำเป็น')
        }

        const product = await Product.findOne({ id }).lean()

        if (!product) {
            throw new Error('ไม่พบสินค้า')
        }

        const unitData = product.listUnit.find((u) => u.unit === unit)

        if (!unitData) {
            throw new Error(`ไม่พบหน่วย '${unit}' สำหรับสินค้านี้`)
        }

        const priceField = type === 'refund' ? 'refund' : 'sale'
        const price = parseFloat(unitData.price[priceField])

        return {
            id: product.id,
            name: product.name,
            group: product.group,
            brand: product.brand,
            size: product.size,
            flavour: product.flavour,
            weightGross: product.weightGross,
            weightNet: product.weightNet,
            unit: unitData.unit,
            unitName: unitData.name,
            factor: parseInt(unitData.factor, 10),
            price
        }
    } catch (error) {
        console.error('Error in getProductDetail:', error.message)
        return null
    }
}

module.exports = { getProductDetail }