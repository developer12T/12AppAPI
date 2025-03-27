const { Givetype, Giveaways } = require('../../models/cash/give')
const { Cart } = require('../../models/cash/cart')
const { User } = require('../../models/cash/user')
const { generateGiveawaysId, generateGivetypeId } = require('../../utilities/genetateId')
const { getProductGive, getStoreGive } = require('./giveProduct')
const { summaryGive } = require('../../utilities/summary')
const { rangeDate } = require('../../utilities/datetime')

exports.addGiveType = async (req, res) => {
    try {
        const {
            name, description, type, remark,
            dept, applicableTo, conditions, status
        } = req.body

        if (!name || !type || !remark || !dept) {
            return res.status(400).json({ status: 400, message: 'Missing required fields!' })
        }

        const giveId = await generateGivetypeId()

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

        if (!giveId || !area) {
            return res.status(400).json({
                status: 400,
                message: 'area and giveId are required!'
            })
        }

        const products = await getProductGive(giveId, area)

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
        const store = await getStoreGive(giveId, area)
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
        const { type, area, storeId, giveId, note, latitude, longitude, shipping } = req.body

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

        const orderId = await generateGiveawaysId(area, sale.warehouse)

        const summary = await summaryGive(cart)

        const newOrder = new Giveaways({
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
            // shipping: {
            //     shippingId: shippingData.shippingId,
            //     address: shippingData.address,
            //     dateRequest: shipping.dateRequest,
            //     note: shipping.note
            // },
            shipping: {
                shippingId: "",
                address: ""
            },
            createdBy: sale.username
        })

        await newOrder.save()
        await Cart.deleteOne({ type, area, storeId })

        res.status(200).json({
            status: 200,
            message: 'Checkout successful!',
            data: { orderId, total: summary.total }
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

        const order = await Giveaways.find(query)
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

        const order = await Giveaways.findOne({ orderId })

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