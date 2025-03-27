const { Promotion } = require('../../models/cash/promotion')
const { Product } = require('../../models/cash/product')

async function rewardProduct(rewards, multiplier) {
    if (!rewards || rewards.length === 0) return []

    const rewardFilters = rewards.map(r => ({
        ...(r.productGroup ? { group: r.productGroup } : {}),
        ...(r.productFlavour ? { flavour: r.productFlavour } : {}),
        ...(r.productBrand ? { brand: r.productBrand } : {}),
        ...(r.productSize ? { size: r.productSize } : {})
    }))

    const eligibleProducts = await Product.find({ $or: rewardFilters }).lean()

    if (!eligibleProducts.length) return []

    return rewards.map(r => {
        const product = eligibleProducts.find(p =>
            (!r.productGroup || p.group === r.productGroup) &&
            (!r.productFlavour || p.flavour === r.productFlavour) &&
            (!r.productBrand || p.brand === r.productBrand) &&
            (!r.productSize || p.size === r.productSize)
        )

        if (!product) return null

        const unitData = product.listUnit.find(unit => unit.unit === r.productUnit)
        const factor = parseInt(unitData?.factor, 10) || 1 
        const productQty = r.limitType === 'limited' ? r.productQty : r.productQty * multiplier
        const productQtyPcs = productQty * factor  

        return {
            productId: product.id,
            productName: product.name,
            productGroup: product.group,
            productFlavour: product.flavour,
            productBrand: product.brand,
            productSize: product.size,
            productUnit: r.productUnit,
            productUnitName: unitData?.name || '',
            productQty,
            productQtyPcs 
        }
    }).filter(Boolean)
}

async function applyPromotion(order) {
    let discountTotal = 0
    let appliedPromotions = []

    const promotions = await Promotion.find({ status: 'active' })

    for (const promo of promotions) {
        let promoApplied = false
        let promoDiscount = 0
        let freeProducts = []

        if (promo.applicableTo?.store?.length > 0 && !promo.applicableTo.store.includes(order.store?.storeId)) continue
        if (promo.applicableTo?.typeStore?.length > 0 && !promo.applicableTo.typeStore.includes(order.store?.storeType)) continue
        if (promo.applicableTo?.zone?.length > 0 && !promo.applicableTo.zone.includes(order.store?.zone)) continue
        if (promo.applicableTo?.area?.length > 0 && !promo.applicableTo.area.includes(order.store?.area)) continue

        let matchedProducts = order.listProduct.filter((product) =>
            promo.conditions.some((condition) =>
                (condition.productId.length === 0 || condition.productId.includes(product.id)) &&
                (condition.productGroup.length === 0 || condition.productGroup.includes(product.group)) &&
                (condition.productBrand.length === 0 || condition.productBrand.includes(product.brand)) &&
                (condition.productFlavour.length === 0 || condition.productFlavour.includes(product.flavour)) &&
                (condition.productSize.length === 0 || condition.productSize.includes(product.size)) &&
                (condition.productUnit.length === 0 || condition.productUnit.includes(product.unit))
            )
        )

        if (matchedProducts.length === 0) continue

        let totalAmount = matchedProducts.reduce((sum, p) => sum + (p.qty * p.price), 0)
        let totalQty = matchedProducts.reduce((sum, p) => sum + p.qty, 0)

        let meetsCondition = promo.conditions.some(condition =>
            (promo.proType === 'free' && condition.productQty > 0 && totalQty >= condition.productQty) ||
            (promo.proType === 'amount' && condition.productAmount > 0 && totalAmount >= condition.productAmount)
        )

        if (!meetsCondition) continue

        let multiplier = 1
        if (promo.rewards[0]?.limitType === 'unlimited') {
            multiplier = promo.conditions.reduce((multiplier, condition) => {
                if (promo.proType === 'free' && condition.productQty > 0) {
                    return Math.floor(totalQty / condition.productQty)
                }
                if (promo.proType === 'amount' && condition.productAmount > 0) {
                    return Math.floor(totalAmount / condition.productAmount)
                }
                return multiplier
            }, 1)
        }

        switch (promo.proType) {
            case 'amount':
            case 'free':
                freeProducts = await rewardProduct(promo.rewards, multiplier)
                promoApplied = true
                break

            case 'discount':
                promoDiscount = promo.discounts.reduce((discount, d) => {
                    if (totalAmount >= d.minOrderAmount) {
                        let discountMultiplier = d.limitType === 'unlimited' ? Math.floor(totalAmount / d.minOrderAmount) : 1
                        return d.discountType === 'percent' ? ((totalAmount * d.discountValue) / 100) * discountMultiplier : d.discountValue * discountMultiplier
                    }
                    return discount
                }, 0)
                promoApplied = true
                break
        }

        if (promoApplied) {
            let selectedProduct = freeProducts.length > 0 ? freeProducts[Math.floor(Math.random() * freeProducts.length)] : null

            appliedPromotions.push({
                proId: promo.proId,
                proName: promo.name,
                proType: promo.proType,
                proQty: selectedProduct.productQty,
                discount: promoDiscount,
                // test:"dawd",
                // ...(selectedProduct && { ...selectedProduct })
                listProduct: [{
                    proId: promo.proId,
                    // proName: 'dawd',
                    id: selectedProduct.productId,
                    name: selectedProduct.productName,
                    group: selectedProduct.productGroup,
                    flavour: selectedProduct.productFlavour,
                    brand: selectedProduct.productBrand,
                    size: selectedProduct.productSize,
                    qty: selectedProduct.productQty,
                    unit: selectedProduct.productUnit,
                    unitName: selectedProduct.productUnitName,
                    qtyPcs: selectedProduct.productQtyPcs
                }]
            })

            discountTotal += promoDiscount
        }
    }

    return { appliedPromotions }
}


async function getRewardProduct(proId) {
    const promotion = await Promotion.findOne({ proId, status: 'active' }).lean()
    if (!promotion || !promotion.rewards || promotion.rewards.length === 0) {
        return []
    }

    let productQuery = { $or: [] }

    promotion.rewards.forEach(reward => {
        let condition = {}
        if (reward.productId) condition.id = reward.productId
        if (reward.productGroup) condition.group = reward.productGroup
        if (reward.productFlavour) condition.flavour = reward.productFlavour
        if (reward.productBrand) condition.brand = reward.productBrand
        if (reward.productSize) condition.size = reward.productSize
        productQuery.$or.push(condition)
    })

    const products = await Product.find(productQuery).lean()
    if (!products.length) return []

    return products.map(product => ({
        proId: promotion.proId,
        productId: product.id,
        id: product.id,
        name: product.name,
        group: product.group,
        brand: product.brand,
        size: product.size,
        flavour: product.flavour,
        type: product.type,
    }))
}

module.exports = { applyPromotion, rewardProduct, getRewardProduct }