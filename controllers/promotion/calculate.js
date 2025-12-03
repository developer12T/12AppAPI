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
const {
    to2,
    getQty,
    updateStockMongo,
    getPeriodFromDate
} = require('../../middleware/order')


async function rewardProduct(rewards, order, multiplier, channel, res) {
    if (!rewards || rewards.length === 0) return []
    const { Product } = getModelsByChannel(channel, res, productModel);
    const { Stock } = getModelsByChannel(channel, res, stockModel);
    const rewardFilters = rewards.map(r => ({
        ...(r.productId ? { id: r.productId } : {}),
        ...(r.productGroup ? { group: r.productGroup } : {}),
        ...(r.productFlavour ? { flavour: r.productFlavour } : {}),
        ...(r.productBrand ? { brand: r.productBrand } : {}),
        ...(r.productSize ? { size: r.productSize } : {}),
        // ...(r.productQty: ? { balancePcs: r.productQty: } : {}),
    }))
    // console.log(rewardFilters)
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


    // 2. Filter เฉพาะที่ match กับ rewardFilters
    function matchFilter(obj, filter) {
        return Object.keys(filter).every(key => obj[key] === filter[key]);
    }

    const filteredStock = stockList.filter(item =>
        rewardFilters.some(filter => matchFilter(item, filter))
    );

    // console.log(filteredStock)
    // 3. แปลง reward ให้เป็นโครงสร้างที่ต้องใช้
    const rewardQty = rewards.map(item => ({
        unit: item.productUnit,
        qty: item.productQty
    }));

    // console.log(rewardQty)

    // 4. สร้าง productStock พร้อม unitList ที่ตรงกับ reward
    const productStock = filteredStock.map(item => ({
        id: item.productId,
        unitList: item.listUnit, // จาก productDetail
        balancePcs: item.balancePcs
    }));

    // 5. ตรวจสอบว่า stock พอสำหรับ reward มั้ย
    const checkList = productStock.map(stock => {
        // const rewardPcs = rewardQty.reduce((sum, reward) => {
        //     const u = stock.unitList.find(u => u.unit === reward.unit);
        //     const factor = u ? u.factor : 1;
        //     return sum + (reward.qty * factor);
        // }, 0);
        // console.log(rewardQty)
        // const rewardPcs = reward.qty
        return {
            id: stock.id,
            totalRewardPcs: rewardQty[0].qty,
            totalStockPcs: stock.balancePcs,
            // enough: stock.balancePcs >= rewardQty[0].qty
        };
    });

    // console.log(checkList)
    // const enoughList = checkList.filter(item => item.enough);
    // console.log(enoughList)
    // 6. ดึงรายละเอียดสินค้าแบบรวดเดียว (Promise.all)
    const eligibleProducts = await Promise.all(
        checkList.map(async item => {
            const dataProduct = await Product.findOne({ id: item.id }).lean();
            return {
                ...dataProduct,
                balancePcs: item.totalStockPcs
            };
        })
    );



    if (!eligibleProducts.length) return []

    const stockById = new Map(
        eligibleProducts.map(p => [p.id, Number(p.balancePcs) || 0])
    );

    const out = [];

    for (const r of rewards) {
        const baseQty = Number(r?.productQty) || 0;
        const productQty = r?.limitType === 'limited'
            ? baseQty
            : baseQty * (Number(multiplier) || 1);

        let remainingUnits = Math.max(0, productQty);
        const allocations = [];

        for (const p of eligibleProducts) {
            const u = (p.listUnit || []).find(
                uu => String(uu.unit).toUpperCase() === String(r.productUnit).toUpperCase()
            );
            if (!u) continue;

            const f = Number(u.factor);
            if (!Number.isFinite(f) || f <= 0) continue;

            // 2) ใช้สต็อกจากพูลแทน p.balancePcs
            const availPcs = stockById.get(p.id) || 0;
            const stockUnits = Math.floor(availPcs / f);
            if (stockUnits <= 0) continue;

            const takeUnits = Math.min(stockUnits, remainingUnits);
            if (takeUnits <= 0) continue;

            allocations.push({
                productId: p.id,
                productName: p.name,
                productGroup: p.group,
                productFlavour: p.flavour,
                productBrand: p.brand,
                productSize: p.size,
                productUnit: u.unit,
                productUnitName: u.name || '',
                productQty: takeUnits,       // หน่วยรางวัล (เช่น BAG/CTN)
                productQtyPcs: takeUnits * f // pcs ที่สัมพันธ์กัน
            });

            // 3) หักสต็อกในพูลทันที
            stockById.set(p.id, availPcs - (takeUnits * f));

            remainingUnits -= takeUnits;
            if (remainingUnits <= 0) break;
        }

        // ถ้าต้องการแบบ fill-or-kill (ไม่พอ = ไม่คอมมิต)
        if (remainingUnits <= 0) {
            out.push(...allocations);
            break; // ถ้าได้ครบตัวแรกแล้วไม่ทำ reward ถัดไป ตามตรรกะเดิม
        }
        // else: ไม่พอ → ทิ้ง allocations ของ reward นี้
    }

    const stockType = 'OUT'
    const productQty = out.flatMap(item => {
        return {
            id: item.productId,
            unit: item.productUnit,
            qty: item.productQty,

        }
    })

    for (i of productQty) {

        const updateResult = await updateStockMongo(
            i,
            order.store.area,
            period(),
            'addproduct',
            channel,
            stockType,
            res
        )
        if (updateResult) return

    }

    // console.log(productQty)





    return out;

}


async function rewardProductCheckStock(rewards, area, multiplier, channel, res) {
    if (!rewards || rewards.length === 0) return []
    const { Product } = getModelsByChannel(channel, res, productModel);
    const { Stock } = getModelsByChannel(channel, res, stockModel);
    const rewardFilters = rewards.map(r => ({
        ...(r.productId ? { id: r.productId } : {}),
        ...(r.productGroup ? { group: r.productGroup } : {}),
        ...(r.productFlavour ? { flavour: r.productFlavour } : {}),
        ...(r.productBrand ? { brand: r.productBrand } : {}),
        ...(r.productSize ? { size: r.productSize } : {}),
        // ...(r.productUnit ? { unit: r.productUnit } : {}),
        // ...(r.productQty: ? { balancePcs: r.productQty: } : {}),
    }))

    // 1. ดึง stock + รายละเอียด product ออกมาครบจบใน aggregate แล้ว
    const stockList = await Stock.aggregate([
        {
            $match: {
                area: area,
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

    // console.log(filteredStock)
    // 3. แปลง reward ให้เป็นโครงสร้างที่ต้องใช้
    const rewardQty = rewards.map(item => ({
        unit: item.productUnit,
        qty: item.productQty
    }));

    // console.log(rewardQty)

    // 4. สร้าง productStock พร้อม unitList ที่ตรงกับ reward
    const productStock = filteredStock.map(item => ({
        id: item.productId,
        unitList: item.listUnit, // จาก productDetail
        balancePcs: item.balancePcs
    }));

    // 5. ตรวจสอบว่า stock พอสำหรับ reward มั้ย
    const checkList = productStock
        // .filter(stock => stock.id !== pid)   // กรองไม่เอา id ที่ตรงกับ pid
        .map(stock => ({
            id: stock.id,
            totalRewardPcs: rewardQty[0].qty,
            totalStockPcs: stock.balancePcs,
            // enough: stock.balancePcs >= rewardQty[0].qty
        }));


    // 6. ดึงรายละเอียดสินค้าแบบรวดเดียว (Promise.all)
    const eligibleProducts = await Promise.all(
        checkList.map(async item => {
            const dataProduct = await Product.findOne({ id: item.id }).lean();
            return {
                ...dataProduct,
                balancePcs: item.totalStockPcs
            };
        })
    );

    if (!eligibleProducts.length) return []

    const findUnit = (p, unit) => {
        if (!unit) return null;
        const uStr = String(unit).toUpperCase();
        return (p.listUnit || []).find(uu => String(uu.unit).toUpperCase() === uStr) || null;
    };

    return rewards.flatMap(r => {
        const needUnits = r.limitType === 'limited' ? r.productQty : r.productQty * multiplier;
        if (!needUnits || needUnits <= 0) return [];

        // คัดผู้สมัครที่ "คุณสมบัติสินค้า" ตรง + มี unit ที่ต้องการ
        const candidates = eligibleProducts
            .filter(p => {
                if (r.productGroup && p.group !== r.productGroup) return false;
                if (r.productFlavour && p.flavour !== r.productFlavour) return false;
                if (r.productBrand && p.brand !== r.productBrand) return false;
                if (r.productSize && p.size !== r.productSize) return false;
                return !!findUnit(p, r.productUnit);
            })
            // เรียงสต็อกมาก -> น้อย เพื่อใช้ตัวที่เหลือเยอะก่อน
            .sort((a, b) => (Number(b.balancePcs) || 0) - (Number(a.balancePcs) || 0));

        let remainingUnits = needUnits;
        const picks = [];

        for (const p of candidates) {
            const u = findUnit(p, r.productUnit);
            const f = Number(u?.factor) || 1;                 // pcs ต่อ 1 หน่วยที่ขอ
            const stockPcs = Number(p.balancePcs) || 0;
            const availableUnits = Math.floor(stockPcs / f);  // หน่วยที่หยิบได้จากตัวนี้

            if (availableUnits <= 0) continue;

            const takeUnits = Math.min(availableUnits, remainingUnits);
            if (takeUnits <= 0) continue;

            picks.push({
                productId: p.id,
                productName: p.name,
                productGroup: p.group,
                productFlavour: p.flavour,
                productBrand: p.brand,
                productSize: p.size,
                productUnit: r.productUnit,
                productUnitName: u?.name || '',
                productQty: takeUnits,           // หน่วยที่ขอ (เช่น PCS/PK/CTN)
                productQtyPcs: takeUnits * f     // แปลงเป็น PCS
            });

            remainingUnits -= takeUnits;
            if (remainingUnits === 0) break;
        }

        // ถ้ายังไม่ครบ → ไม่ต้องให้ reward ชุดนี้ (หรือจะ rollback stockRemain ถ้าคุณกันสต็อกไว้)
        if (remainingUnits > 0) {
            return []; // ไม่พอทั้งก้อน
        }

        return picks; // คืนหลายแถวรวมกันสำหรับ reward นี้
    }).filter(Boolean);
}







async function applyPromotion(order, channel, res) {

    // console.log(order)
    const { Promotion } = getModelsByChannel(channel, res, promotionModel);
    const { Product } = getModelsByChannel(channel, res, productModel);
    const { Store, TypeStore } = getModelsByChannel(channel, res, storeModel);
    const periodStr = period()
    // const periodStr = "202508"
    const year = parseInt(periodStr.slice(0, 4));
    const month = parseInt(periodStr.slice(4, 6));

    const startMonth = new Date(year, month - 1, 1);
    const nextMonth = new Date(year, month, 1);

    // console.log("startMonth",startMonth)
    // console.log("nextMonth",nextMonth)

    const productIds = order.listProduct.flatMap(item => item.id)

    const productAll = await Product.find({ id: { $in: productIds } });


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
        // console.log(promo.proId)

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


        const sumOrder = Object.values(
            (order.listProduct || []).reduce((acc, product) => {

                const factorPromoPcs = productAll.find(p => p.id === product.id)
                    ?.listUnit.find(i => i.unit === 'BOT' || i.unit === 'PCS').price.sale
                if (!acc[product.id]) {

                    acc[product.id] = {
                        id: product.id,
                        name: product.name,
                        groupCode: product.groupCode,
                        group: product.group,
                        brandCode: product.brandCode,
                        brand: product.brand,
                        size: product.size,
                        flavourCode: product.flavourCode,
                        flavour: product.flavour,
                        qtyPcs: product.qtyPcs,
                        qty: 0,
                        unit: product.unit,
                        price: product.price,
                        total: 0,
                        qtyPromo: 0,
                        unitPromo: '',
                        pricePcs: factorPromoPcs
                    };
                }

                // รวมค่า
                acc[product.id].qty += product.qtyPcs || 0;
                acc[product.id].total += product.total || 0;

                return acc;
            }, {})
        );

        sumOrder.forEach(item => {
            promo.conditions.some(condition => {
                if (condition.productUnit) {

                    // ✅ ต้องหา productAll ที่ id ตรงกับ item.id
                    const factorPromo = productAll.find(p => p.id === item.id)
                        ?.listUnit.find(i => i.unit === condition.productUnit[0]);



                    const factor = factorPromo?.factor || 0;
                    const qtyPromo = factor > 0 ? Math.floor((item.qty || 0) / factor) : 0;
                    if (qtyPromo > 0) {
                        item.qtyPromo = qtyPromo;               // อัปเดตกลับเข้า object
                        item.unitPromo = condition.productUnit[0];
                        return true; // หยุดที่ condition นี้พอ
                    }
                }
                return false;
            });
        });

        
        let matchedProducts = sumOrder.filter(product =>
            promo.conditions.some(condition => {
                return (
                    (condition.productId.length === 0 || condition.productId.includes(product.id)) &&
                    (condition.productGroup.length === 0 || condition.productGroup.includes(product.group)) &&
                    (condition.productBrand.length === 0 || condition.productBrand.includes(product.brand)) &&
                    (condition.productFlavour.length === 0 || condition.productFlavour.includes(product.flavour)) &&
                    (condition.productSize.length === 0 || condition.productSize.includes(product.size))
                    &&
                    (condition.productUnit.length === 0 || condition.productUnit.includes(product.unitPromo))
                )
            })
        );
        
        if (matchedProducts.length === 0) continue
        


        // let totalAmount = matchedProducts.reduce((sum, p) => sum + (p.qtyPcs * p.pricePcs), 0)
        // let totalAmount = matchedProducts.reduce((sum, p) => sum + (p.total), 0)
        let totalAmount = 0
        if (channel === 'pc') {
            totalAmount = order.totalProCalDiff
        }else{
            totalAmount = matchedProducts.reduce((sum, p) => sum + (p.total), 0)
        }

        console.log("totalAmount",totalAmount)

        let totalQty = matchedProducts.reduce((sum, p) => sum + p.qtyPromo, 0)

        // console.log(totalAmount)
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

        // console.log(freeProducts)
        // console.log("promo",promo.proId)

        const qtyInPromo = (freeProducts ?? []).reduce(
            (sum, item) => sum + (Number(item?.productQty) || 0),
            0
        );

        // ถ้าแจกได้น้อยกว่าหรือเท่ากับ multiplier → ส่งกลับเป็น array ว่าง
        if (qtyInPromo < (Number(multiplier) || 0)) {
            continue;
        }



        if (promoApplied) {
            const items = (freeProducts || []).map(sp => ({
                proId: promo.proId,
                id: sp.productId,
                name: sp.productName,
                group: sp.productGroup,
                flavour: sp.productFlavour,
                brand: sp.productBrand,
                size: sp.productSize,
                qty: Number(sp.productQty) || 0,          // จำนวนตามหน่วยที่ขอ (เช่น CTN/BAG/PCS)
                unit: sp.productUnit,
                unitName: sp.productUnitName || '',
                qtyPcs: Number(sp.productQtyPcs) || 0     // จำนวนคิดเป็น PCS
            }));

            // รวมยอดทั้งหมดของของแถมในโปรนี้
            const proQtySum = items.reduce((s, x) => s + x.qty, 0);
            const proQtyPcsSum = items.reduce((s, x) => s + x.qtyPcs, 0);

            appliedPromotions.push({
                proId: promo.proId,
                proCode: promo.proCode,
                proName: promo.name,
                proType: promo.proType,
                proQty: proQtySum,         // เดิมใช้ตัวเดียว; ตอนนี้ใช้ยอดรวมของทุกตัว
                proQtyPcs: proQtyPcsSum,   // (ถ้าต้องการเก็บเป็น PCS รวมด้วย)
                discount: promoDiscount,
                listProduct: items
            });

            discountTotal += promoDiscount;
        }
        // console.log(appliedPromotions)
    }

    const seenProIds = new Set();
    appliedPromotions = appliedPromotions.filter(promo => {
        if (promo.proQty === 0) return false;        // ❌ ตัดถ้า proQty = 0
        if (seenProIds.has(promo.proId)) return false; // ❌ ตัดถ้า proId ซ้ำ
        seenProIds.add(promo.proId);
        return true;
    });



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



module.exports = { applyPromotion, rewardProduct, getRewardProduct, applyPromotionUsage, applyQuota, rewardProductCheckStock }