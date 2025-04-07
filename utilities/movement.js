const { Order } = require('../models/cash/sale')
const { Refund } = require('../models/cash/refund')
const { Giveaway } = require('../models/cash/give')
const { Receive } = require('../models/cash/distribution')
const { Product } = require('../models/cash/product')
const { User } = require('../models/cash/user')
const { rangeDate } = require('../utilities/datetime')


async function getStockMovement(area, period) {
    try {
        if (!area || !period) throw new Error('Area and period are required')

        const { startDate, endDate } = rangeDate(period)

        const users = await User.find({ area }).select('saleCode').lean()
        const saleCode = users.map(user => user.saleCode)
        // console.log(users)
        if (saleCode.length === 0) return { message: 'No saleCode found for area' }

        const modules = [
            { model: Order },
            { model: Refund },
            { model: Giveaway },
            { model: Receive }
        ]
        
        
        let allModuleData = []

        for (const module of modules) {
            try {
                let query = {
                    status: { $ne: 'canceled' },
                    createdAt: { $gte: startDate, $lte: endDate }
                }

                if (module.model.modelName === 'Receive') {
                    query['area'] = area
                    query['saleCode'] = saleCode
                } else {
                    query['store.area'] = area
                    query['sale.saleCode'] = saleCode
                }
                // query ของแต่ล่ะเงื่อนไขมาหา
                const moduleData = await module.model.find(query).lean()
                if (moduleData.length > 0) {
                    allModuleData.push(...moduleData)
                }
                // console.log("module",module.model.find(query))
            } catch (err) {
                console.error(`Error fetching data from ${module.model.modelName}:`, err)
            }
        }
        // console.log("allModuleData", JSON.stringify(allModuleData, null, 2));

        
        if (allModuleData.length === 0) {
            return { message: `No data found for area: ${area}` }
        }

        let results = {}

        for (const doc of allModuleData) {
            const type = doc.type
            const saleCode = doc.sale?.saleCode || doc.saleCode || ''

            if (!results[type]) {
                results[type] = {
                    type,
                    area,
                    saleCode,
                    listProduct: {}
                }
            }

            const allProducts = [...(doc.listProduct || [])]
            // console.log("allProducts",allProducts)
            
            if (doc.listPromotions) {
                doc.listPromotions.forEach(promo => {
                    if (promo.listProduct) {
                        allProducts.push(...promo.listProduct)
                    }
                })
            }
            // console.log("results",results)
            
            allProducts.forEach(item => {
                const conditionKey = doc.type === 'refund' && item.condition ? `${item.id}_${item.condition}` : item.id
                if (!results[type].listProduct[conditionKey]) {
                    results[type].listProduct[conditionKey] = {
                        product: {
                            id: item.id,
                            name: item.name,
                            group: item.group,
                            brand: item.brand,
                            size: item.size,
                            flavour: item.flavour
                        },
                        qtyPcs: 0,
                        ...(item.condition ? { condition: item.condition } : {})
                    }
                }

                results[type].listProduct[conditionKey].qtyPcs += item.qtyPcs || 0
                // console.log("results",JSON.stringify(results[type], null, 2))

            })
        }
        
        const productIds = [...new Set(Object.values(results).flatMap(group => Object.values(group.listProduct).map(p => p.product.id)))]
        const productDetails = await Product.find({ id: { $in: productIds } }).lean()
        
        for (const type in results) {
            const stockMovements = []
            
            for (const productKey in results[type].listProduct) {
                const productData = results[type].listProduct[productKey]
                console.log("results[type].listProduct",results[type].listProduct[productKey])
                const productInfo = productDetails.find(p => p.id === productData.product.id)
                if (!productInfo) continue

                let totalPcs = productData.qtyPcs
                const movement = []

                if (!Array.isArray(productInfo.listUnit) || productInfo.listUnit.length === 0) {
                    console.warn(`Product ${productInfo.id} has no listUnit`)
                    continue
                }

                productInfo.listUnit.sort((a, b) => b.factor - a.factor)

                for (let unit of productInfo.listUnit) {
                    const qty = Math.floor(totalPcs / unit.factor)
                    if (qty > 0) {
                        movement.push({
                            unit: unit.unit,
                            name: unit.name,
                            qty
                        })
                    }
                    totalPcs %= unit.factor
                }

                if (totalPcs > 0) {
                    const smallestUnit = productInfo.listUnit.find(u => u.factor === 1)
                    if (smallestUnit) {
                        movement.push({
                            unit: smallestUnit.unit,
                            name: smallestUnit.name,
                            qty: totalPcs
                        })
                    }
                }

                stockMovements.push({
                    product: productData.product,
                    qtyPcs: productData.qtyPcs,
                    movement,
                    ...(productData.condition ? { condition: productData.condition } : {})
                })
            }

            results[type].listProduct = stockMovements
        }
        // console.dir(Object.values(results), { depth: null });


        return Object.values(results)
    } catch (error) {
        console.error('Error fetching stock movement data:', error)
        return { error: error.message }
    }
}

module.exports = { getStockMovement }