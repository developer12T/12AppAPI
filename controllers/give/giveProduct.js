const { Product } = require('../../models/cash/product')
const { Store } = require('../../models/cash/store')
const { Givetype } = require('../../models/cash/give')

async function getProductGive(giveId, area) {
    try {
        const giveType = await Givetype.findOne({ giveId }).lean()

        if (!giveType) {
            return []
        }

        const conditions = giveType.conditions

        if (!conditions || conditions.length === 0) {
            return []
        }

        let productQuery = { statusSale: 'Y' }
        let unitFilter = {}

        conditions.forEach(condition => {
            if (condition.productId.length > 0) {
                productQuery.id = { $in: condition.productId }
            }
            if (condition.productGroup.length > 0) {
                productQuery.group = { $in: condition.productGroup }
            }
            if (condition.productBrand.length > 0) {
                productQuery.brand = { $in: condition.productBrand }
            }
            if (condition.productSize.length > 0) {
                productQuery.size = { $in: condition.productSize }
            }
            if (condition.productFlavour.length > 0) {
                productQuery.flavour = { $in: condition.productFlavour }
            }

            if (condition.productUnit.length > 0) {
                unitFilter[condition.productUnit.join(',')] = condition.productUnit
            }
        })

        const products = await Product.find(productQuery).lean()

        if (!products.length) {
            return []
        }

        const enrichedProducts = products.map(product => {
            let filteredUnits = product.listUnit

            Object.keys(unitFilter).forEach(key => {
                if (unitFilter[key].length > 0) {
                    filteredUnits = filteredUnits.filter(unit => unitFilter[key].includes(unit.unit))
                }
            })

            const unitsWithSalePrice = filteredUnits.map(unit => ({
                unit: unit.unit,
                name: unit.name,
                factor: unit.factor,
                price: unit.price?.sale || '0.00'
            }))

            return {
                id: product.id,
                name: product.name,
                group: product.group,
                brand: product.brand,
                size: product.size,
                flavour: product.flavour,
                type: product.type,
                weightGross: product.weightGross,
                weightNet: product.weightNet,
                statusSale: product.statusSale,
                statusWithdraw: product.statusWithdraw,
                statusRefund: product.statusRefund,
                image: product.image || '',
                listUnit: unitsWithSalePrice
            }
        })

        return enrichedProducts

    } catch (error) {
        console.error('Error fetching products by give type:', error)
        return []
    }
}

async function getStoreGive(giveId, area) {
    try {
        const giveType = await Givetype.findOne({ giveId }).lean()
        if (!giveType) {
            return []
        }

        const applicableTo = giveType.applicableTo

        const hasApplicableFilters = Object.values(applicableTo).some(arr => arr.length > 0)

        if (!hasApplicableFilters) {
            return await Store.find({ area }).select('storeId name address type zone area').lean()
        }

        let storeQuery = { $and: [{ area }] }

        if (applicableTo.store.length > 0) {
            storeQuery.$and.push({ storeId: { $in: applicableTo.store } })
        }
        if (applicableTo.typeStore.length > 0) {
            storeQuery.$and.push({ type: { $in: applicableTo.typeStore } })
        }
        if (applicableTo.zone.length > 0) {
            storeQuery.$and.push({ zone: { $in: applicableTo.zone } })
        }
        if (applicableTo.area.length > 0) {
            storeQuery.$and.push({ area: { $in: applicableTo.area } })
        }

        const stores = await Store.find(storeQuery).select('storeId name address type zone area').lean()

        if (stores.length === 0) {
            return []
        }

        return stores

    } catch (error) {
        console.error('Error fetching stores by give type:', error)
        return []
    }
}

module.exports = { getProductGive, getStoreGive }