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

function sortProduct(data, group) {
    const parseSize = (s) => {
        const str = String(s || '')
        const num = parseFloat(str.replace(/[^0-9.]/g, '')) || 0 // ดึงตัวเลข
        if (/\bkg\b/i.test(str)) return num * 1000 // KG -> กรัม
        if (/\bg\b/i.test(str)) return num // G -> กรัม
        return num // ถ้าไม่เจอหน่วย -> ใช้เป็นกรัม
    }

    return data.sort((a, b) => {
        // 1) เทียบ group แบบ natural (รองรับตัวเลข)
        const gA = String(a[group] || '')
        const gB = String(b[group] || '')
        const g = gA.localeCompare(gB, undefined, {
            numeric: true,
            sensitivity: 'base'
        })
        if (g !== 0) return g

        // 2) เทียบ size (normalize เป็นกรัม)
        const sizeA = parseSize(a.size)
        const sizeB = parseSize(b.size)
        if (sizeA !== sizeB) return sizeB - sizeA

        // 3) tie-breaker: เทียบสตริง size ตรง ๆ
        return String(a.size || '').localeCompare(String(b.size || ''), undefined, {
            numeric: true,
            sensitivity: 'base'
        })
    })
}






module.exports = { getProductDetail, sortProduct }