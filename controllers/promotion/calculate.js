const { Promotion } = require('../../models/cash/promotion')
const { Product } = require('../../models/cash/product')
const promotionModel = require('../../models/cash/promotion')
const productModel = require('../../models/cash/product')
const { getModelsByChannel } = require('../../middleware/channel')
const promotionLimitModel = require('../../models/cash/promotion');
const storeModel = require('../../models/cash/store')
const stockModel = require('../../models/cash/stock')
const { each, forEach } = require('lodash')
const { period, previousPeriod } = require('../../utilities/datetime')
const stock = require('../../models/cash/stock')



async function rewardProduct(rewards, order, multiplier, channel, res) {
    if (!rewards || rewards.length === 0) return []
    const { Product } = getModelsByChannel(channel, res, productModel);
    const { Stock } = getModelsByChannel(channel, res, stockModel);
    const rewardFilters = rewards.map(r => ({
        ...(r.productId ? { id: r.productId } : {}),
        ...(r.productGroup ? { group: r.productGroup } : {}),
        ...(r.productFlavour ? { flavour: r.productFlavour } : {}),
        ...(r.productBrand ? { brand: r.productBrand } : {}),
        // ...(r.productUnit ? { unit: r.productUnit } : {}),
        // ...(r.productQty: ? { balancePcs: r.productQty: } : {}),
    }))

    // 1. ดึง stock + รายละเอียด product ออกมาครบจบใน aggregate แล้ว
    const stockList = await Stock.aggregate([
        {
            $match: {
                area: order.store.area,
                period: period()
            }
        },
        { $unwind: '$listProduct' },
        {
            $lookup: {
                from: 'products',
                localField: 'listProduct.productId',
                foreignField: 'id',
                as: 'productDetail'
            }
        },
        { $unwind: '$productDetail' },
        {
            $match: {
                'productDetail.statusSale': 'Y'
            }
        },
        {
            $replaceRoot: {
                newRoot: {
                    $mergeObjects: ['$listProduct', '$productDetail']
                }
            }
        }
    ]);

    // console.log(stockList)

    // 2. Filter เฉพาะที่ match กับ rewardFilters
    function matchFilter(obj, filter) {
        return Object.keys(filter).every(key => obj[key] === filter[key]);
    }

    const filteredStock = stockList.filter(item =>
        rewardFilters.some(filter => matchFilter(item, filter))
    );

    // 3. แปลง reward ให้เป็นโครงสร้างที่ต้องใช้
    const rewardQty = rewards.map(item => ({
        unit: item.productUnit,
        qty: item.productQty
    }));

    // 4. สร้าง productStock พร้อม unitList ที่ตรงกับ reward
    const productStock = filteredStock.map(item => ({
        id: item.productId,
        unitList: item.listUnit, // จาก productDetail
        balancePcs: item.balancePcs
    }));

    // 5. ตรวจสอบว่า stock พอสำหรับ reward มั้ย
    const checkList = productStock.map(stock => {
        const rewardPcs = rewardQty.reduce((sum, reward) => {
            const u = stock.unitList.find(u => u.unit === reward.unit);
            const factor = u ? u.factor : 1;
            return sum + (reward.qty * factor);
        }, 0);
        return {
            id: stock.id,
            totalRewardPcs: rewardPcs,
            totalStockPcs: stock.balancePcs,
            enough: stock.balancePcs >= rewardPcs
        };
    });

    const enoughList = checkList.filter(item => item.enough);
    // console.log(enoughList)
    // 6. ดึงรายละเอียดสินค้าแบบรวดเดียว (Promise.all)
    const eligibleProducts = await Promise.all(
        enoughList.map(async item => {
            const dataProduct = await Product.findOne({ id: item.id }).lean();
            return {
                ...dataProduct,
                balancePcs: item.totalStockPcs
            };
        })
    );


    if (!eligibleProducts.length) return []

    return rewards.map(r => {
        const product = eligibleProducts.find(p =>
            (!r.productGroup || p.group === r.productGroup) &&
            (!r.productFlavour || p.flavour === r.productFlavour) &&
            (!r.productBrand || p.brand === r.productBrand) &&
            (!r.productSize || p.size === r.productSize)
        )
        // console.log("test",product)
        if (!product) return null

        const unitData = product.listUnit.find(unit => unit.unit === r.productUnit)
        const factor = parseInt(unitData?.factor, 10) || 1
        const productQty = r.limitType === 'limited' ? r.productQty : r.productQty * multiplier
        const productQtyPcs = productQty * factor
        // console.log(r.productUnit)

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

async function applyPromotion(order, channel, res) {

    // console.log(order)
    const { Promotion } = getModelsByChannel(channel, res, promotionModel);
    const { Store, TypeStore } = getModelsByChannel(channel, res, storeModel);
    const periodStr = period()
    // const periodStr = "202508"
    const year = parseInt(periodStr.slice(0, 4));
    const month = parseInt(periodStr.slice(4, 6));

    const startMonth = new Date(year, month - 1, 1);
    const nextMonth = new Date(year, month, 1);

    // console.log("startMonth",startMonth)
    // console.log("nextMonth",nextMonth)
    let discountTotal = 0
    let appliedPromotions = []

    let query = {}
    query.createdAt = {
        $gte: startMonth,
        $lt: nextMonth
    }

    const promotions = await Promotion.find({ status: 'active' })

    const dataStore = await Store.aggregate([
        { $match: query },
        {
            $match: {
                storeId: order.store?.storeId
            }
        }])
    const newStore = dataStore[0]
    // console.log(order.store.storeId)
    const beautyStore = await TypeStore.findOne({
        storeId: order.store.storeId,
        type: { $in: ["beauty"] }
    });



    for (const promo of promotions) {
        let promoApplied = false
        let promoDiscount = 0
        let freeProducts = []

        if (promo.applicableTo?.store?.length > 0 && !promo.applicableTo.store.includes(order.store?.storeId)) continue;
        if (promo.applicableTo?.typeStore?.length > 0 && !promo.applicableTo.typeStore.includes(order.store?.storeType)) continue;
        if (promo.applicableTo?.zone?.length > 0 && !promo.applicableTo.zone.includes(order.store?.zone)) continue;
        if (promo.applicableTo?.area?.length > 0 && !promo.applicableTo.area.includes(order.store?.area)) continue;

        // beauty store check
        const isInCompleteBeauty = promo.applicableTo?.completeStoreBeauty?.includes(order.store?.storeId) === true;
        if (promo.applicableTo?.isbeauty === true) {
            if (
                isInCompleteBeauty === false &&
                beautyStore
            ) {
            } else {
                continue;
            }
        }
        // if (promo.applicableTo?.isbeauty === true && !beautyStore) continue;


        const isInCompleteNew = promo.applicableTo?.completeStoreNew?.includes(order.store?.storeId) === true;
        if (promo.applicableTo?.isNewStore === true) {
            if (
                isInCompleteNew === false &&
                newStore
            ) {
            } else {
                continue;
            }
        }


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
        // console.log("promo.conditions",promo.conditions)

        if (matchedProducts.length === 0) continue

        let totalAmount = matchedProducts.reduce((sum, p) => sum + (p.qty * p.price), 0)
        let totalQty = matchedProducts.reduce((sum, p) => sum + p.qty, 0)

        let meetsCondition = promo.conditions.some(condition =>
            (promo.proType === 'free' && condition.productQty >= 0 && totalQty >= condition.productQty) ||
            (promo.proType === 'amount' && condition.productAmount >= 0 && totalAmount >= condition.productAmount)

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
            // console.log(multiplier)
        }
        // console.log(promo.rewards)
        switch (promo.proType) {
            case 'amount':
                freeProducts = await rewardProduct(promo.rewards, order, multiplier, channel, res)
                promoApplied = true
                break
            case 'free':
                freeProducts = await rewardProduct(promo.rewards, order, multiplier, channel, res)
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
            // console.log(freeProducts)
            let selectedProduct = freeProducts.length > 0 ? freeProducts[0] : {}
            // console.log(selectedProduct)
            appliedPromotions.push({
                proId: promo.proId,
                proCode: promo.proCode,
                proName: promo.name,
                proType: promo.proType,
                proQty: selectedProduct.productQty,
                discount: promoDiscount,
                test: "dawd",
                listProduct: [{
                    proId: promo.proId,
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
        // console.log(appliedPromotions)
    }
    return { appliedPromotions }
}


async function applyQuota(order, channel, res) {


    const { Quota } = getModelsByChannel(channel, res, promotionModel);
    let discountTotal = 0
    let appliedPromotions = []

    const quota = await Quota.find()

    const validPromos = [];
    let multiplier = 1
    // console.log(order)
    for (const promo of quota) {
        if (promo.applicableTo?.store?.length > 0 && !promo.applicableTo.store.includes(order.store?.storeId)) continue;
        if (promo.applicableTo?.typeStore?.length > 0 && !promo.applicableTo.typeStore.includes(order.store?.storeType)) continue;
        if (promo.applicableTo?.zone?.length > 0 && !promo.applicableTo.zone.includes(order.store?.zone)) continue;
        if (promo.applicableTo?.area?.length > 0 && !promo.applicableTo.area.includes(order.store?.area)) continue;

        // let matchedProducts = order.listProduct.filter((product) =>
        //     promo.conditions.some((condition) =>
        //         (condition.productId.length === 0 || condition.productId.includes(product.id)) &&
        //         (condition.productGroup.length === 0 || condition.productGroup.includes(product.group)) &&
        //         (condition.productBrand.length === 0 || condition.productBrand.includes(product.brand)) &&
        //         (condition.productFlavour.length === 0 || condition.productFlavour.includes(product.flavour)) &&
        //         (condition.productSize.length === 0 || condition.productSize.includes(product.size)) &&
        //         (condition.productUnit.length === 0 || condition.productUnit.includes(product.unit))
        //     )
        // )
        freeProducts = await rewardProduct(promo.rewards, multiplier, channel, res)

        if (freeProducts) {
            let selectedProduct = freeProducts.length > 0 ? freeProducts[Math.floor(Math.random() * freeProducts.length)] : {}

            appliedPromotions.push({
                quotaId: promo.quotaId,
                detail: promo.detail,
                proCode: promo.proCode,
                quota: 1,
                listProduct: [{
                    id: selectedProduct.productId,
                    name: selectedProduct.productName,
                    lot: selectedProduct.lot,
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
            // console.log(JSON.stringify(appliedPromotions, null, 2));
        }
    }


    return { appliedPromotions }
}







async function getRewardProduct(proId, channel, res) {

    const { Promotion } = getModelsByChannel(channel, res, promotionModel);
    const { Product } = getModelsByChannel(channel, res, productModel);

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
        condition.statusSale = "Y"  // <== ใส่แบบนี้ถูกต้อง
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

async function applyPromotionUsage(storeId, promotion, channel, res) {

    // const { Promotion } = getModelsByChannel(channel,res,promotionModel); 
    const { PromotionLimit } = getModelsByChannel(channel, res, promotionLimitModel);


    const proIds = promotion.map(u => u.proId)
    const promotionData = await PromotionLimit.find({ proId: { $in: proIds } })
    // console.log(JSON.stringify(promotion, null, 2));

    // const data = promotionData.map(u => {
    //     console.log(u)
    //     const productPromo = promotion.find(p => p.proId === u.proId);
    //     return {
    //         proId: u.proId,
    //         // qty: productPromo.proQty
    //         listProduct:u.listProduct.map(item => {
    //             return {
    //                 id:item.id,
    //                 qty:item.qty
    //             }
    //         }

    //         )
    //     }
    // })
    //     console.log(data)
    // for (const item  of data) {
    //     const promoqty = await PromotionLimit.findOne({ proId:item.proId })
    //     console.log(promoqty)
    //     const divqty = promoqty.qty - item.qty
    //     // console.log(divqty)
    // }




}



module.exports = { applyPromotion, rewardProduct, getRewardProduct, applyPromotionUsage, applyQuota }