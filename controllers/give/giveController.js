// const { Givetype, Giveaways } = require('../../models/cash/give')
// const { Cart } = require('../../models/cash/cart')
// const { User } = require('../../models/cash/user')
const { generateGiveawaysId, generateGivetypeId } = require('../../utilities/genetateId')
const { getProductGive, getStoreGive } = require('./giveProduct')
const { summaryGive } = require('../../utilities/summary')
const { rangeDate } = require('../../utilities/datetime')
const { period, previousPeriod } = require('../../utilities/datetime')
const productModel = require('../../models/cash/product')

const stockModel = require('../../models/cash/stock')
const giveawaysModel = require('../../models/cash/give');
const cartModel = require('../../models/cash/cart')
const userModel = require('../../models/cash/user')
const { getModelsByChannel } = require('../../middleware/channel')

exports.addGiveType = async (req, res) => {
    try {
        const {
            name, description, type, remark,
            dept, applicableTo, conditions, status
        } = req.body

        const channel = req.headers['x-channel'];
        const { Givetype } = getModelsByChannel(channel, res, giveawaysModel);

        if (!name || !type || !remark || !dept) {
            return res.status(400).json({ status: 400, message: 'Missing required fields!' })
        }

        const giveId = await generateGivetypeId(channel, res)

        const newPromotion = new Givetype({
            giveId, name, description, type, remark,
            dept, applicableTo, conditions, status: 'active'
        })

        newPromotion.createdAt = new Date()
        await newPromotion.save()

        res.status(201).json({
            status: 201,
            message: 'Give type created successfully!',
            data: newPromotion
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ status: '500', message: error.message })
    }
}

exports.getGiveType = async (req, res) => {
    try {
        const channel = req.headers['x-channel'];
        const { Givetype } = getModelsByChannel(channel, res, giveawaysModel);

        const givetypes = await Givetype.find({}).select('-_id giveId name').lean()

        if (!givetypes || givetypes.length === 0) {
            return res.status(404).json({
                status: 404,
                message: 'No give types found!',
                data: []
            })
        }

        res.status(200).json({
            status: 200,
            message: 'Successful!',
            data: givetypes
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ status: '500', message: error.message })
    }
}

exports.getGiveProductFilter = async (req, res) => {
    try {
        const { area, giveId, group, brand, size, flavour } = req.body
        const channel = req.headers['x-channel'];

        if (!giveId || !area) {
            return res.status(400).json({
                status: 400,
                message: 'area and giveId are required!'
            })
        }

        const products = await getProductGive(giveId, area, channel, res)

        if (!products.length) {
            return res.status(404).json({
                status: 404,
                message: 'No products found for the given giveId and area',
                data: []
            })
        }

        const isEmptyArray = (arr) => Array.isArray(arr) && arr.length === 0

        if (isEmptyArray(group) && isEmptyArray(brand) && isEmptyArray(size) && isEmptyArray(flavour)) {
            const uniqueGroups = [...new Set(products.map(p => p.group))]
            return res.status(200).json({
                status: 200,
                message: 'Successfully fetched product groups!',
                data: { group: uniqueGroups, brand: [], size: [], flavour: [] }
            })
        }

        let filteredProducts = products

        if (!isEmptyArray(group)) {
            filteredProducts = filteredProducts.filter(p => group.includes(p.group))
        }
        if (!isEmptyArray(brand)) {
            filteredProducts = filteredProducts.filter(p => brand.includes(p.brand))
        }
        if (!isEmptyArray(size)) {
            filteredProducts = filteredProducts.filter(p => size.includes(p.size))
        }
        if (!isEmptyArray(flavour)) {
            filteredProducts = filteredProducts.filter(p => flavour.includes(p.flavour))
        }

        if (!filteredProducts.length) {
            return res.status(404).json({
                status: 404,
                message: 'No products match the given filters',
                data: []
            })
        }

        const groupedData = {
            group: [...new Set(filteredProducts.map(p => p.group))],
            brand: [...new Set(filteredProducts.map(p => p.brand))].filter(Boolean),
            size: [...new Set(filteredProducts.map(p => p.size))].filter(Boolean),
            flavour: [...new Set(filteredProducts.map(p => p.flavour))].filter(Boolean)
        }

        res.status(200).json({
            status: 200,
            message: 'Successfully fetched give product filters!',
            data: groupedData
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ status: '500', message: error.message })
    }
}

exports.getGiveStoreFilter = async (req, res) => {
    try {
        const { area, giveId } = req.query
        const channel = req.headers['x-channel'];
        const store = await getStoreGive(giveId, area, channel, res)
        res.status(200).json({
            status: 200,
            message: 'Successfully fetched give store filters!',
            data: store
        })
    } catch (error) {
        console.error(error)
        res.status(500).json({ status: '500', message: error.message })
    }
}

exports.checkout = async (req, res) => {
    try {
        const { type, area, period, storeId, giveId, note, latitude, longitude, shipping } = req.body
        const channel = req.headers['x-channel'];
        const { Cart } = getModelsByChannel(channel, res, cartModel);
        const { User } = getModelsByChannel(channel, res, userModel);
        const { Product } = getModelsByChannel(channel, res, productModel)

        const { Givetype } = getModelsByChannel(channel, res, giveawaysModel);
        const { Giveaway } = getModelsByChannel(channel, res, giveawaysModel);
        const { Stock, StockMovementLog, StockMovement } = getModelsByChannel(channel, res, stockModel);



        if (!type || !area || !storeId || !giveId || !shipping) {
            return res.status(400).json({ status: 400, message: 'Missing required fields!' })
        }

        const cart = await Cart.findOne({ type, area, storeId })
        if (!cart || cart.listProduct.length === 0) {
            return res.status(404).json({ status: 404, message: 'Cart is empty!' })
        }

        const sale = await User.findOne({ area }).select('firstName surName warehouse tel saleCode salePayer')
        if (!sale) {
            return res.status(404).json({ status: 404, message: 'Sale user not found!' })
        }

        const give = await Givetype.findOne({ giveId }).select('-_id giveId name type remark dept')
        if (!give) {
            return res.status(404).json({ status: 404, message: 'Give type not found!' })
        }

        const orderId = await generateGiveawaysId(area, sale.warehouse, channel, res)

        const summary = await summaryGive(cart, channel, res)



        const newOrder = new Giveaway({
            type,
            orderId,
            giveInfo: give,
            sale: {
                saleCode: sale.saleCode,
                salePayer: sale.salePayer,
                name: `${sale.firstName} ${sale.surName}`,
                tel: sale.tel || '',
                warehouse: sale.warehouse
            },
            store: {
                storeId: summary.store.storeId,
                name: summary.store.name,
                type: summary.store.type,
                address: summary.store.address,
                taxId: summary.store.taxId,
                tel: summary.store.tel,
                area: summary.store.area,
                zone: summary.store.zone
            },
            note,
            latitude,
            longitude,
            status: 'pending',
            listProduct: summary.listProduct,
            totalVat: summary.totalVat,
            totalExVat: summary.totalExVat,
            total: summary.total,
            shipping: {
                shippingId: "",
                address: ""
            },
            createdBy: sale.username,
            period: period,
        })


        if (!newOrder.store.area) {

            return res.status(400).json({
                status:400,
                message:'Not found store'
            })
        }

        
        const calStock = {
            // storeId: refundOrder.store.storeId,
            orderId: newOrder.orderId,
            area: newOrder.store.area,
            saleCode: newOrder.sale.saleCode,
            period: period,
            warehouse: newOrder.sale.warehouse,
            status: 'pending',
            action: "Give",
            type: "Give",
            product: newOrder.listProduct.map(u => {
                return {
                    productId: u.id,
                    unit: u.unit,
                    qty: u.qty,
                    statusMovement: 'OUT'
                }
            })
        }



        const productQty = newOrder.listProduct.map(u => {
            return {
                productId: u.id,
                unit: u.unit,
                qty: u.qty
            }
        })

        for (const item of productQty) {
            const factorPcsResult = await Product.aggregate([
                { $match: { id: item.productId } },
                {
                    $project: {
                        id: 1,
                        listUnit: {
                            $filter: {
                                input: "$listUnit",
                                as: "unitItem",
                                cond: { $eq: ["$$unitItem.unit", item.unit] }
                            }
                        }
                    }
                }
            ]);

            const factorCtnResult = await Product.aggregate([
                { $match: { id: item.productId } },
                {
                    $project: {
                        id: 1,
                        listUnit: {
                            $filter: {
                                input: "$listUnit",
                                as: "unitItem",
                                cond: { $eq: ["$$unitItem.unit", "CTN"] }
                            }
                        }
                    }
                }
            ]);
            const factorCtn = factorCtnResult[0].listUnit[0].factor
            const factorPcs = factorPcsResult[0].listUnit[0].factor
            const factorPcsQty = item.qty * factorPcs
            const factorCtnQty = Math.floor(factorPcsQty / factorCtn);
            const data = await Stock.findOneAndUpdate(
                {
                    area: area,
                    period: period,
                    'listProduct.productId': item.productId
                },
                {
                    $inc: {
                        'listProduct.$[elem].stockOutPcs': +factorPcsQty,
                        'listProduct.$[elem].balancePcs': -factorPcsQty,
                        'listProduct.$[elem].stockOutCtn': +factorCtnQty,
                        'listProduct.$[elem].balanceCtn': -factorCtnQty
                    }
                },
                {
                    arrayFilters: [
                        { 'elem.productId': item.productId }
                    ],
                    new: true
                }
            );
        }

        // console.log(newOrder)






        const createdMovement = await StockMovement.create({
            ...calStock
        });

        await StockMovementLog.create({
            ...calStock,
            refOrderId: createdMovement._id
        });



        await newOrder.save()
        await Cart.deleteOne({ type, area, storeId })

        res.status(200).json({
            status: 200,
            message: 'Checkout successful!',
            data: newOrder
            // data: { orderId, total: summary.total }
        })
    } catch (error) {
        console.error(error)
        res.status(500).json({ status: '500', message: error.message })
    }
}

exports.getOrder = async (req, res) => {
    try {
        const { type, area, store, period } = req.query
        let response = []

        const channel = req.headers['x-channel'];
        const { Giveaway } = getModelsByChannel(channel, res, giveawaysModel);

        if (!type || !area || !period) {
            return res.status(400).json({ status: 400, message: 'type, area, period are required!' })
        }

        const { startDate, endDate } = rangeDate(period)

        let query = {
            type,
            'store.area': area,
            createdAt: { $gte: startDate, $lt: endDate }
        }

        if (store) {
            query['store.storeId'] = store
        }

        const order = await Giveaway.find(query)
            .select('orderId giveInfo.name store.createdAt store.storeId store.name store.address total status')
            .lean()

        if (!order || order.length === 0) {
            return res.status(404).json({
                status: 404,
                message: 'No orders found!',
                data: []
            })
        }

        response = order.map((o) => ({
            orderId: o.orderId,
            giveName: o.giveInfo?.name || '',
            storeId: o.store?.storeId || '',
            storeName: o.store?.name || '',
            storeAddress: o.store?.address || '',
            createAt: o.createdAt,
            total: o.total,
            status: o.status
        }))

        res.status(200).json({
            status: 200,
            message: 'Successful!',
            data: response
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ status: '500', message: error.message })
    }
}

exports.getDetail = async (req, res) => {
    try {
        const { orderId } = req.params
        if (!orderId) {
            return res.status(400).json({ status: 400, message: 'orderId is required!' })
        }

        const channel = req.headers['x-channel'];
        const { Giveaway } = getModelsByChannel(channel, res, giveawaysModel);


        const order = await Giveaway.findOne({ orderId })

        res.status(200).json({
            status: 200,
            message: 'successful!',
            data: [order]
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ status: '500', message: error.message })
    }
}