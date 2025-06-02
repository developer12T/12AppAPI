// const { Refund } = require('../../models/cash/refund')
// const { Order } = require('../../models/cash/sale')
// const { Cart } = require('../../models/cash/cart')
// const { User } = require('../../models/cash/user')
const { generateOrderId, generateRefundId } = require('../../utilities/genetateId')
const { summaryRefund } = require('../../utilities/summary')
const { rangeDate } = require('../../utilities/datetime')
const { uploadFiles } = require('../../utilities/upload')
const path = require('path')
const multer = require('multer')
const upload = multer({ storage: multer.memoryStorage() }).single('image')

const refundModel = require('../../models/cash/refund')
const orderModel = require('../../models/cash/sale')
const cartModel = require('../../models/cash/cart')
const userModel = require('../../models/cash/user')
const stockModel = require('../../models/cash/stock')
const { getModelsByChannel } = require('../../middleware/channel')





exports.checkout = async (req, res) => {
    try {
        const { type, area, period, storeId, note, latitude, longitude, shipping, payment } = req.body
        const channel = req.headers['x-channel'];
        const { Cart } = getModelsByChannel(channel, res, cartModel);
        const { User } = getModelsByChannel(channel, res, userModel);
        const { Refund } = getModelsByChannel(channel, res, refundModel);
        const { Order } = getModelsByChannel(channel, res, orderModel);
        const { Stock,StockMovementLog,StockMovement } = getModelsByChannel(channel, res, stockModel);


        if (!type || type !== 'refund') {
            return res.status(400).json({ status: 400, message: 'Invalid type! Must be "refund".' })
        }

        if (!type || !area || !storeId || !shipping || !payment) {
            return res.status(400).json({ status: 400, message: 'Missing required fields!' })
        }


        // console.log(type, area, storeId)

        const cart = await Cart.findOne({ type, area, storeId })
        // console.log("cart",cart)
        // if (!cart || cart.listProduct.length === 0) {
        if (!cart || cart.length === 0) {
            return res.status(404).json({ status: 404, message: 'Cart is empty!' })
        }

        const sale = await User.findOne({ area }).select('username firstName surName warehouse tel saleCode salePayer')
        if (!sale) {
            return res.status(404).json({ status: 404, message: 'Sale user not found!' })
        }

        const refundOrderId = await generateRefundId(area, sale.warehouse, channel, res)
        const changeOrderId = await generateOrderId(area, sale.warehouse, channel, res)

        const summary = await summaryRefund(cart, channel, res)
        // console.log('summary:', JSON.stringify(summary, null, 2))

        const refundOrder = new Refund({
            type: 'refund',
            orderId: refundOrderId,
            reference: changeOrderId,
            sale: {
                saleCode: sale.saleCode,
                salePayer: sale.salePayer,
                name: `${sale.firstName} ${sale.surName}`,
                tel: sale.tel,
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
            listProduct: summary.listRefund,
            total: summary.totalRefund,
            totalExVat: parseFloat((summary.totalRefund / 1.07).toFixed(2)),
            vat: parseFloat((summary.totalRefund - (summary.totalRefund / 1.07)).toFixed(2)),
            listImage: [],
            createdBy: sale.username
        })

        // console.log("refundOrder",refundOrder)
        const changeOrder = new Order({
            type: 'change',
            orderId: changeOrderId,
            reference: refundOrderId,
            sale: {
                saleCode: sale.saleCode,
                salePayer: sale.salePayer,
                name: `${sale.firstName} ${sale.surName}`,
                tel: sale.tel,
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
            shipping: { shippingId: shipping, address: '' },
            note,
            latitude,
            longitude,
            status: 'pending',
            listProduct: summary.listProduct,
            subtotal: summary.totalChange,
            total: summary.totalChange,
            totalExVat: parseFloat((summary.totalChange / 1.07).toFixed(2)),
            vat: parseFloat((summary.totalChange - (summary.totalChange / 1.07)).toFixed(2)),
            listPromotions: [],
            listImage: [],
            paymentMethod: payment,
            paymentStatus: 'unpaid',
            createdBy: sale.username
        })

        // console.log(refundOrder)
        const calStock = {
            // storeId: refundOrder.store.storeId,
            orderId : refundOrder.orderId,
            area: refundOrder.store.area,
            saleCode: refundOrder.sale.saleCode,
            period: period,
            warehouse: refundOrder.sale.warehouse,
            status: 'pending',
            action: "Refund",
            type: "Refund",
            product: refundOrder.listProduct.map(u => {
                return {
                    productId: u.id,
                    lot: u.lot,
                    unit: u.unit,
                    qty: u.qty,
                    condition: u.condition
                }
            })
        }
        // console.log("calStock",calStock)

        const productId = calStock.product.flatMap(u => u.productId)

        const stock = await Stock.aggregate([
            { $match: { area: area, period: period } },
            { $unwind: { path: '$listProduct', preserveNullAndEmptyArrays: true } },
            { $match: { "listProduct.productId": { $in: productId } } },
            {
                $project: {
                    _id: 0,
                    productId: "$listProduct.productId",
                    sumQtyPcs: "$listProduct.sumQtyPcs",
                    sumQtyCtn: "$listProduct.sumQtyCtn",
                    sumQtyPcsStockIn: "$listProduct.sumQtyPcsStockIn",
                    sumQtyCtnStockIn: "$listProduct.sumQtyCtnStockIn",
                    sumQtyPcsStockOut: "$listProduct.sumQtyPcsStockOut",
                    sumQtyCtnStockOut: "$listProduct.sumQtyCtnStockOut",
                    available: "$listProduct.available"
                }
            }
        ]);
        // console.log(JSON.stringify(stock, null, 2));

        let listProduct = []
        let updateLot = []

        for (const stockDetail of stock) {
            for (const lot of stockDetail.available) {

                const calDetails = calStock.product.filter(
                    u => u.productId === stockDetail.productId && u.lot === lot.lot
                );
                    let pcsQtyGood = 0;
                    let pcsQtyDamaged = 0;
                    let ctnQtyGood = 0;
                    let ctnQtyDamaged = 0;

                    for (const cal of calDetails) {
                        if ((cal.unit === 'PCS' || cal.unit === 'BOT') && cal.condition === 'good') {
                        pcsQtyGood += cal.qty || 0;
                        }
                        if ((cal.unit === 'PCS' || cal.unit === 'BOT') && cal.condition === 'damaged') {
                        pcsQtyDamaged += cal.qty || 0;
                        }
                        if (cal.unit === 'CTN' && cal.condition === 'good') {
                        ctnQtyGood += cal.qty || 0;
                        }
                        if (cal.unit === 'CTN' && cal.condition === 'damaged') {
                        ctnQtyDamaged += cal.qty || 0;
                        }
                    }
                    
                    checkQtyPcs = lot.qtyPcs + pcsQtyGood - pcsQtyDamaged
                    checkQtyCtn = lot.qtyCtn + ctnQtyGood - ctnQtyDamaged

                    if (checkQtyPcs < 0 || checkQtyCtn < 0) {
                        return res.status(400).json({
                            status:400,
                            message: `This lot ${lot.lot} is not enough to refund`
                        })
                    }


                    updateLot.push({
                        productId: stockDetail.productId,
                        location: lot.location,
                        lot: lot.lot,
                        qtyPcs: checkQtyPcs,
                        qtyPcsStockIn: lot.qtyPcsStockIn + pcsQtyGood,
                        qtyPcsStockOut: lot.qtyPcsStockOut + pcsQtyDamaged,
                        qtyCtn: checkQtyCtn,
                        qtyCtnStockIn: lot.qtyCtnStockIn + ctnQtyGood,
                        qtyCtnStockOut: lot.qtyCtnStockOut + ctnQtyDamaged
                    });

            }


  
            const relatedLots = updateLot.filter((u) => u.productId === stockDetail.productId);
            listProduct.push({
                productId: stockDetail.productId,
                sumQtyPcs: relatedLots.reduce((total, item) => total + item.qtyPcs, 0),
                sumQtyCtn: relatedLots.reduce((total, item) => total + item.qtyCtn, 0),
                sumQtyPcsStockIn: relatedLots.reduce((total, item) => total + item.qtyPcsStockIn, 0),
                sumQtyCtnStockIn: relatedLots.reduce((total, item) => total + item.qtyCtnStockIn, 0),
                sumQtyPcsStockOut: relatedLots.reduce((total, item) => total + item.qtyPcsStockOut, 0),
                sumQtyCtnStockOut: relatedLots.reduce((total, item) => total + item.qtyCtnStockOut, 0),
                available: relatedLots.map(({ id, ...rest }) => rest),
            });
        }
        // console.log("listProduct",listProduct)

        for (const updated of listProduct) {
            await Stock.findOneAndUpdate(
                { area: area, period: period },
                {
                    $set: {
                        "listProduct.$[product].sumQtyPcs": updated.sumQtyPcs,
                        "listProduct.$[product].sumQtyCtn": updated.sumQtyCtn,
                        "listProduct.$[product].sumQtyPcsStockIn": updated.sumQtyPcsStockIn,
                        "listProduct.$[product].sumQtyCtnStockIn": updated.sumQtyCtnStockIn,
                        "listProduct.$[product].sumQtyPcsStockOut": updated.sumQtyPcsStockOut,
                        "listProduct.$[product].sumQtyCtnStockOut": updated.sumQtyCtnStockOut,
                        "listProduct.$[product].available": updated.available
                    }
                },
                { arrayFilters: [{ "product.productId": updated.productId }], new: true }
            )
        }
           
        // const createdMovement = await StockMovement.create({
        //     ...calStock
        // });

        // await StockMovementLog.create({
        //     ...calStock,
        //     refOrderId: createdMovement._id
        // });


        await refundOrder.save()
        await changeOrder.save()
        await Cart.deleteOne({ type, area, storeId })
        res.status(200).json({
            status: 200,
            message: 'Checkout successful!',
            data: {
                refundOrder,
                // listProduct
                changeOrder
            }
        })
    } catch (error) {
        console.error(error)
        res.status(500).json({ status: '500', message: error.message })
    }
}

exports.getRefund = async (req, res) => {
    try {
        const { type, area, store, period } = req.query

        const channel = req.headers['x-channel'];
        const { Refund } = getModelsByChannel(channel, res, refundModel);
        const { Order } = getModelsByChannel(channel, res, orderModel);


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

        const refunds = await Refund.find(query)
            .select('orderId store.createdAt store.storeId store.name store.address total status')
            .lean()

        if (!refunds || refunds.length === 0) {
            return res.status(404).json({
                status: 404,
                message: 'No refund orders found!',
                data: []
            })
        }

        response = await Promise.all(refunds.map(async (refund) => {
            const orderChange = await Order.findOne({
                reference: refund.orderId,
                type: 'change'
            }).select('total').lean()

            const totalChange = orderChange?.total || 0
            const totalRefund = refund.total || 0
            const total = (totalChange - totalRefund).toFixed(2)

            return {
                orderId: refund.orderId,
                storeId: refund.store?.storeId || '',
                storeName: refund.store?.name || '',
                storeAddress: refund.store?.address || '',
                totalChange: totalChange.toFixed(2),
                totalRefund: totalRefund.toFixed(2),
                total: total,
                status: refund.status
            }
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
            return res.status(400).json({
                status: 400,
                message: 'orderId is required!'
            })
        }

        const channel = req.headers['x-channel'];
        const { Refund } = getModelsByChannel(channel, res, refundModel);
        const { Order } = getModelsByChannel(channel, res, orderModel);



        const refund = await Refund.findOne({ orderId }).lean()
        if (!refund) {
            return res.status(404).json({ status: 404, message: 'Refund not found!' })
        }

        const order = await Order.findOne({
            reference: refund.orderId,
            type: 'change'
        }).lean()

        const listProductRefund = refund.listProduct.map(product => ({
            id: product.id,
            name: product.name,
            group: product.group,
            brand: product.brand,
            size: product.size,
            flavour: product.flavour,
            qty: product.qty,
            unit: product.unit,
            unitName: product.unitName,
            price: product.price,
            netTotal: product.total,
            condition: product.condition
        }))

        const listProductChange = order ? order.listProduct.map(product => ({
            id: product.id,
            name: product.name,
            group: product.group,
            brand: product.brand,
            size: product.size,
            flavour: product.flavour,
            qty: product.qty,
            unit: product.unit,
            unitName: product.unitName,
            price: product.price,
            netTotal: product.netTotal
        })) : []

        const totalChange = order ? order.total : 0
        const totalChangeExVat = parseFloat((totalChange / 1.07).toFixed(2))
        const totalChangeVat = parseFloat((totalChange - totalChangeExVat).toFixed(2))
        const totalRefund = refund.total
        const totalRefundExVat = parseFloat((totalRefund / 1.07).toFixed(2))
        const totalRefundVat = parseFloat((totalRefund - totalRefundExVat).toFixed(2))
        const total = parseFloat((totalChange - totalRefund).toFixed(2))

        res.status(200).json({
            type: refund.type,
            orderId: refund.orderId,
            reference: refund.reference || '',
            sale: refund.sale,
            store: refund.store,
            note: refund.note,
            latitude: refund.latitude,
            longitude: refund.longitude,
            shipping: refund.shipping || { shippingId: '', address: '' },
            status: refund.status,
            listProductRefund,
            listProductChange,
            totalRefundExVat,
            totalRefundVat,
            totalRefund,
            totalChangeExVat,
            totalChangeVat,
            totalChange,
            totalDiff: total,
            paymentMethod: refund.paymentMethod || 'cash',
            paymentStatus: refund.paymentStatus || 'unpaid',
            createdAt: refund.createdAt,
            updatedAt: refund.updatedAt,
            listImage: order ? order.listImage || [] : []
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ status: 500, message: error.message })
    }
}

exports.addSlip = async (req, res) => {
    try {

        const channel = req.headers['x-channel'];
        const { Order } = getModelsByChannel(channel, res, orderModel);

        upload(req, res, async (err) => {
            if (err) {
                return res.status(400).json({ status: 400, message: 'Error uploading file', error: err.message })
            }

            const { orderId, type } = req.body
            if (!orderId || !type) {
                return res.status(400).json({ status: 400, message: 'orderId and type required!' })
            }

            const order = await Order.findOne({ orderId })
            if (!order) {
                return res.status(404).json({ status: 404, message: 'Order not found!' })
            }

            if (!req.file) {
                return res.status(400).json({ status: 400, message: 'No images uploaded!' })
            }

            const basePath = path.join(__dirname, '../../public/images')
            const uploadedImage = await uploadFiles([req.file], basePath, type, order.orderId)

            order.listImage = [{
                name: uploadedImage[0].name,
                path: uploadedImage[0].path,
                type: type
            }]

            await order.save()

            res.status(200).json({
                status: 200,
                message: 'Images uploaded successfully!',
                data: order.listImage
            })
        })
    } catch (error) {
        console.error('Error uploading images:', error)
        res.status(500).json({ status: 500, message: 'Server error', error: error.message })
    }
}

exports.updateStatus = async (req, res) => {
    try {
        const { orderId, status } = req.body

        const channel = req.headers['x-channel'];
        const { Refund } = getModelsByChannel(channel, res, refundModel);
        const { Order } = getModelsByChannel(channel, res, orderModel);


        if (!orderId || !status) {
            return res.status(400).json({ status: 400, message: 'orderId and status are required!' })
        }

        const refundOrder = await Refund.findOne({ orderId })
        if (!refundOrder) {
            return res.status(404).json({ status: 404, message: 'Refund order not found!' })
        }

        if (refundOrder.status !== 'pending' && status !== 'canceled') {
            return res.status(400).json({ status: 400, message: 'Cannot update status, refund is not in pending state!' })
        }

        let newOrderId = orderId

        if (status === 'canceled' && !orderId.endsWith('CC')) {
            newOrderId = `${orderId}CC`

            const isDuplicate = await Refund.findOne({ orderId: newOrderId })
            if (isDuplicate) {
                let counter = 1
                while (await Refund.findOne({ orderId: `${orderId}CC${counter}` })) {
                    counter++
                }
                newOrderId = `${orderId}CC${counter}`
            }
        }

        const updatedRefund = await Refund.findOneAndUpdate(
            { orderId },
            { $set: { status, orderId: newOrderId } },
            { new: true }
        )

        const updatedOrder = await Order.findOneAndUpdate(
            { orderId: refundOrder.reference, type: 'change' },
            { $set: { status } },
            { new: true }
        )

        res.status(200).json({
            status: 200,
            message: 'Updated status successfully!',
        })
    } catch (error) {
        console.error('Error updating refund status:', error)
        res.status(500).json({ status: 500, message: 'Server error' })
    }
}