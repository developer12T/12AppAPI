const mongoose = require('mongoose')
const { Types } = require('mongoose')
const { ObjectId } = mongoose.Types
const { Customer } = require('../../models/cash/master')
const { CustomerBI } = require('../../models/cash/powerBi')
const { Customer_OMS, Customer_OMS_BK } = require('../../models/cash/data_oms')
const { Customer_APIM3 } = require('../../models/cash/data_api')
const { Customer_M3FDBPRD_BK } = require('../../models/cash/M3FDBPRD_BK')
const { Customer_DC } = require('../../models/cash/data_dc')
const {
    Customer_096,
    Customer_096_BK,
    Customer_096_TEMP
} = require('../../models/cash/data096')
const { uploadFiles } = require('../../utilities/upload')
const { sequelize, DataTypes } = require('../../config/m3db')
// const { sequelize, DataTypes } = require('../../config/powerBi')
const { Sequelize } = require('sequelize')
const { Op } = require('sequelize')

const { calculateSimilarity } = require('../../utilities/utility')
const axios = require('axios')
const multer = require('multer')
const userModel = require('../../models/cash/user')
const storeLatLongModel = require('../../models/cash/storeLatLong')
const ExcelJS = require('exceljs')
const { generateOrderIdStoreLatLong } = require('../../utilities/genetateId')
const { getSocket } = require('../../socket')
const addUpload = multer({ storage: multer.memoryStorage() }).array(
    'storeImages'
)

const {
    to2,
    updateStockMongo,
    generateDateList
} = require('../../middleware/order')

const { PromotionStore } = require('../../models/cash/master')
const { toThaiTime, period } = require('../../utilities/datetime')
const sharp = require('sharp')
const xlsx = require('xlsx')

const sql = require('mssql')
const {
    storeQuery,
    storeQueryFilter,
    groupStoreType,
    routeQuery,
    routeQueryOne,
    updateLatLong, getDataRoute
} = require('../../controllers/queryFromM3/querySctipt')
const {
    generateOrderId,
    generateOrderIdFoodTruck,
    generateOrderIdDammy,
    getNextStoreEditNumber
} = require('../../utilities/genetateId')
const orderModel = require('../../models/cash/sale')
const storeModel = require('../../models/cash/store')
const routeModel = require('../../models/cash/route')
const refundModel = require('../../models/cash/refund')
const approveLogModel = require('../../models/cash/approveLog')
// const userModel = require('../../models/cash/user')
const DistributionModel = require('../../models/cash/distribution')
const promotionModel = require('../../models/cash/promotion')
const { getModelsByChannel } = require('../../middleware/channel')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { v4: uuidv4 } = require('uuid')
const { rangeDate } = require('../../utilities/datetime')

const storeTimestamps = {}

exports.updateStoreStatusV2 = async (req, res) => {
    try {
        const { storeId, status, user } = req.body

        const now = Date.now()
        const lastUpdate = storeTimestamps[storeId] || 0
        const ONE_MINUTE = 30 * 1000

        if (now - lastUpdate < ONE_MINUTE) {
            return res.status(429).json({
                status: 429,
                message:
                    'This order was updated less than 30 sec ago. Please try again later!'
            })
        }
        storeTimestamps[storeId] = now

        setTimeout(() => {
            delete storeTimestamps[storeId]
        }, ONE_MINUTE)

        const channel = req.headers['x-channel']
        const { RunningNumber, Store } = getModelsByChannel(
            channel,
            res,
            storeModel
        )
        const { User } = getModelsByChannel(channel, res, userModel)
        const { ApproveLogs } = getModelsByChannel(channel, res, approveLogModel)
        const { Order } = getModelsByChannel(channel, res, orderModel)
        const { Promotion, PromotionShelf, Quota } = getModelsByChannel(
            channel,
            res,
            promotionModel
        )
        const { Route, RouteSetting, RouteChangeLog } = getModelsByChannel(channel, res, routeModel)
        const store = await Store.findOne({ storeId: storeId })
        // console.log(store)
        if (!store) {
            return res.status(404).json({
                status: 404,
                message: 'Not found store'
            })
        }
        const storeZone = store.area.substring(0, 2)
        const maxRunningAll = await RunningNumber.findOne({
            zone: storeZone
        }).select('last')

        // console.log(maxRunningAll)

        const oldId = maxRunningAll
        // console.log(oldId, 'oldId')
        const newId = oldId.last.replace(/\d+$/, n =>
            String(+n + 1).padStart(n.length, '0')
        )

        // console.log(newId, 'newId')

        // console.log("oldId",oldId)
        if (status === '20') {


            await RunningNumber.findOneAndUpdate(
                { zone: store.zone },
                { $set: { last: newId } },
                { new: true }
            )
            await Store.findOneAndUpdate(
                { _id: store._id },
                {
                    $set: {
                        storeId: newId,
                        status: status,
                        updatedDate: Date(),
                        'approve.dateAction': new Date(),
                        'approve.appPerson': user
                    }
                },
                { new: true }
            )

            const item = await Store.findOne({ storeId: newId, area: store.area })
            // const item = await Store.findOne({ storeId: storeId, area: store.area })
            const dataUser = await User.findOne({ area: store.area, role: 'sale' })

            if (!item) {
                return res.status(404).json({
                    json: 404,
                    message: 'Not found Store'
                })
            }

            // if (!item.postCode) {
            //   return res.status(404).json({
            //     json: 404,
            //     message: 'Not found postCode'
            //   })
            // }

            // console.log((item.province ?? '').substring(0, 35))
            const dataTran = {
                Hcase: 1,
                customerNo: item.storeId,
                customerStatus: item.status ?? '',
                customerName: item.name ?? '',
                customerChannel: '103',
                customerCoType: item.type ?? '',
                customerAddress1: (
                    item.address +
                    item.subDistrict +
                    // item.subDistrict +
                    item.province +
                    item.postCode ?? ''
                ).substring(0, 35),
                customerAddress2: (
                    item.address +
                    item.subDistrict +
                    // item.subDistrict +
                    item.province +
                    item.postCode ?? ''
                ).substring(35, 70),
                customerAddress3: (
                    item.address +
                    item.subDistrict +
                    // item.subDistrict +
                    item.province +
                    item.postCode ?? ''
                ).substring(70, 105),
                customerAddress4: '',
                customerPoscode: (item.postCode ?? '').substring(0, 35),
                customerPhone: item.tel ?? '',
                warehouse: dataUser.warehouse ?? '',
                OKSDST: item.zone ?? '',
                saleTeam: dataUser.area.slice(0, 2) + dataUser.area[3],
                OKCFC1: item.area ?? '',
                OKCFC3: item.route ?? '',
                OKCFC6: item.type ?? '',
                salePayer: dataUser.salePayer ?? '',
                creditLimit: '000',
                taxno: item.taxId ?? '',
                saleCode: dataUser.saleCode ?? '',
                saleZone: dataUser.zone ?? '',
                OKFRE1: item.postCode,
                OKECAR: item.postCode.slice(0, 2),
                OKCFC4: item.area ?? '',
                OKTOWN: item.province,
                shippings: item.shippingAddress.map(u => {
                    return {
                        shippingAddress1: (u.address ?? '').substring(0, 35),
                        shippingAddress2: u.district ?? '',
                        shippingAddress3: u.subDistrict ?? '',
                        shippingAddress4: u.province ?? '',
                        shippingPoscode: u.postCode ?? '',
                        shippingPhone: item.tel ?? '',
                        shippingRoute: u.postCode,
                        OPGEOX: u.latitude,
                        OPGEOY: u.longtitude
                    }
                })
            }

            // console.log(dataTran)

            if (item.area != 'IT211') {
                try {
                    const response = await axios.post(
                        `${process.env.API_URL_12ERP}/customer/insert`,
                        dataTran
                    )

                    // ส่งกลับไปให้ client ที่เรียก Express API
                    return res.status(response.status).json(response.data)
                } catch (error) {
                    if (error.response) {
                        // หาก ERP ส่ง 400 หรือ 500 หรืออื่นๆ กลับมา
                        return res.status(error.response.status).json({
                            message: error.response.data?.message || 'Request Failed',
                            data: error.response.data
                        })
                    }
                }
            }

            const orderData = await Order.find({ 'store.storeId': storeId, status: 'waitApprove', 'store.area': item.area })
            if (orderData.length > 0) {
                for (const row of orderData) {
                    const orderId = await generateOrderId(row.store.area, row.sale.warehouse, channel, res)
                    await Order.findOneAndUpdate(
                        { _id: row._id },
                        {
                            $set: {
                                'store.storeId': newId,
                                orderId: orderId,
                                status: 'pending',
                                statusTH: 'รอนำเข้า'
                            }
                        }
                    )

                    if (row.listPromotions.length > 0) {
                        for (const pro of row.listPromotions) {
                            const promotionDetail = await Promotion.findOne({ proId: pro.proId })
                            if (promotionDetail &&
                                promotionDetail.applicableTo.isNewStore === true) {

                                await Promotion.updateOne(
                                    {
                                        proId: pro.proId,
                                    },
                                    {
                                        $addToSet: {
                                            'applicableTo.completeStoreNew': newId
                                        }
                                    }
                                )
                            }
                        }
                    }
                }
            }
            const existRouteChangeLog = await RouteChangeLog.findOne({ status: 'approved', period: period(), storeId: storeId })
            if (existRouteChangeLog) {
                const exists = await RouteSetting.findOne({
                    period: period(),
                    area: existRouteChangeLog.area,
                    lockRoute: {
                        $elemMatch: {
                            id: existRouteChangeLog.routeId,
                            listStore: {
                                $elemMatch: {
                                    storeInfo: existRouteChangeLog.storeInfo
                                }
                            }
                        }
                    }
                }).lean()


                if (exists !== null) {
                    const result = await RouteSetting.updateOne(
                        {
                            period: period(),
                            area: existRouteChangeLog.area
                        },
                        {
                            $set: {
                                'lockRoute.$[r].listStore.$[s].storeId': newId,
                                'lockRoute.$[r].listStore.$[s].lock': false
                            }
                        },
                        {
                            arrayFilters: [
                                { 'r.id': existRouteChangeLog.routeId },        // <-- lockRoute.id
                                { 's.storeInfo': existRouteChangeLog.storeInfo } // <-- listStore.storeInfo
                            ]
                        }
                    )

                }


            }

            const io = getSocket()
            io.emit('store/updateStoreStatus', {
                status: 'success',
                data: newId
            })

            //   return res.status(500).json({
            //     message: 'Internal Server Error',
            //     error: error.message
            //   })
            // }
            await ApproveLogs.create({
                module: 'approveStore',
                user: user,
                status: 'approved',
                id: item.storeId,
            })

            return res.status(200).json({
                status: 200,
                message: 'update Store Status sucess',
                storeId: item.storeId
            })
        } else {
            const storeNew = await Store.findOneAndUpdate(
                { _id: store._id },
                {
                    $set: {
                        status: status,
                        updatedDate: Date(),
                        'approve.dateAction': new Date(),
                        'approve.appPerson': user
                    }
                },
                { new: true }
            )

            const orderData = await Order.find({ 'store.storeId': storeId, status: 'waitApprove', 'store.area': storeNew.area })


            if (orderData.length > 0) {

                for (const row of orderData) {

                    if (row.listProduct.length > 0) {
                        for (const product of row.listProduct) {
                            const updateResult = await updateStockMongo(
                                product,
                                row.store.area,
                                row.period,
                                'orderCanceled',
                                channel,
                                res
                            )
                            if (updateResult) return
                        }
                    }

                    if (row.listPromotions.length > 0) {
                        for (const item of row.listPromotions) {
                            const promotionDetail =
                                (await Promotion.findOne({ proId: item.proId })) ||
                                new Promotion({ proId: item.proId })
                            const storeIdToRemove = row.store.storeId
                            if (promotionDetail.applicableTo?.isNewStore === true) {
                                promotionDetail.applicableTo.completeStoreNew =
                                    promotionDetail.applicableTo.completeStoreNew?.filter(
                                        storeId => storeId !== storeIdToRemove
                                    ) || []
                            } else if (promotionDetail.applicableTo?.isbeauty === true) {
                                promotionDetail.applicableTo.completeStoreBeauty =
                                    promotionDetail.applicableTo.completeStoreBeauty?.filter(
                                        storeId => storeId !== storeIdToRemove
                                    ) || []
                            }
                            await promotionDetail.save().catch(() => { }) // ถ้าเป็น doc ใหม่ต้อง .save()
                            for (const u of item.listProduct) {
                                const updateResult = await updateStockMongo(
                                    u,
                                    row.store.area,
                                    row.period,
                                    'orderCanceled',
                                    channel,
                                    res
                                )
                                if (updateResult) return
                            }
                        }
                    }
                }

                await Order.updateMany(
                    { 'store.storeId': storeId },
                    {
                        $set: {
                            status: 'canceled',
                            statusTH: 'ยกเลิก'
                        }
                    }
                )

            }

            const existRouteChangeLog = await RouteChangeLog.findOne({
                status: 'approved',
                period: period(),
                storeId
            })


            if (existRouteChangeLog) {

                // ลบ store ออกจาก Route
                await Route.updateOne(
                    {
                        period: period(),
                        id: existRouteChangeLog.routeId
                    },
                    {
                        $pull: {
                            listStore: {
                                storeInfo: existRouteChangeLog.storeInfo
                            }
                        }
                    }
                )

                // ลบ store ออกจาก RouteSetting
                await RouteSetting.updateOne(
                    {
                        period: period(),
                        area: existRouteChangeLog.area
                    },
                    {
                        $pull: {
                            'lockRoute.$[route].listStore': {
                                storeId: existRouteChangeLog.storeId
                            }
                        }
                    },
                    {
                        arrayFilters: [
                            { 'route.id': existRouteChangeLog.routeId }
                        ]
                    }
                )
            }

            await ApproveLogs.create({
                module: 'approveStore',
                user: user,
                status: 'rejected',
                id: storeId
            })

            res.status(200).json({
                status: 200,
                message: 'Reject Store successful'
            })
        }
    } catch (error) {
        console.error('❌ Error:', error)

        res.status(500).json({
            status: 500,
            message: 'error from server',
            error: error.message || error.toString(), // ✅ ป้องกัน circular object
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
        })
    }
}

exports.addStorePcToCash = async (req, res) => {
    try {
        const { storeId, area } = req.body
        const channel = req.headers['x-channel']
        const {
            RunningNumber: RunningNumberCash,
            Store: StoreCash
        } = getModelsByChannel(channel, res, storeModel)

        const {
            RunningNumber: RunningNumberPC,
            Store: StorePC
        } = getModelsByChannel('pc', res, storeModel)
        const { User } = getModelsByChannel(channel, res, userModel)



        // const storesCash = await StoreCash.find({ area: 'IT211' })
        const storesPc = await StorePC.findOne({ storeId: storeId }).lean()
        const dataUser = await User.findOne({ area: area, role: 'sale' })
        const storeZone = area.substring(0, 2)
        const maxRunningAll = await RunningNumberCash.findOne({
            zone: storeZone
        }).select('last')

        const oldId = maxRunningAll

        const newId = oldId.last.replace(/\d+$/, n =>
            String(+n + 1).padStart(n.length, '0')
        )


        const dataToCash = {
            ...storesPc,
            storeId: newId,
            storeIdOld: storeId,
            zone: storeZone,
            area: area

        }

        const existed = await StoreCash.findOne({
            storeIdOld: storesPc.storeId
        })

        if (existed) {
            return res.status(409).json({
                message: 'store already exists in cash',
                storeId: existed.storeId
            })
        }

        await StoreCash.create(dataToCash)


        await RunningNumberCash.findOneAndUpdate(
            { zone: storeZone },
            { $set: { last: newId } },
            { new: true }
        )

        const dataTran = {
            Hcase: 1,
            customerNo: dataToCash.storeId,
            customerStatus: dataToCash.status ?? '',
            customerName: dataToCash.name ?? '',
            customerChannel: '103',
            customerCoType: dataToCash.type ?? '',
            customerAddress1: (
                dataToCash.address +
                dataToCash.subDistrict +
                // item.subDistrict +
                dataToCash.province +
                dataToCash.postCode ?? ''
            ).substring(0, 35),
            customerAddress2: (
                dataToCash.address +
                dataToCash.subDistrict +
                // item.subDistrict +
                dataToCash.province +
                dataToCash.postCode ?? ''
            ).substring(35, 70),
            customerAddress3: (
                dataToCash.address +
                dataToCash.subDistrict +
                // item.subDistrict +
                dataToCash.province +
                dataToCash.postCode ?? ''
            ).substring(70, 105),
            customerAddress4: '',
            customerPoscode: (dataToCash.postCode ?? '').substring(0, 35),
            customerPhone: dataToCash.tel ?? '',
            warehouse: dataUser.warehouse ?? '',
            OKSDST: dataToCash.zone ?? '',
            saleTeam: dataUser.area.slice(0, 2) + dataUser.area[3],
            OKCFC1: dataToCash.area ?? '',
            OKCFC3: dataToCash.route ?? '',
            OKCFC6: dataToCash.type ?? '',
            salePayer: dataUser.salePayer ?? '',
            creditLimit: '000',
            taxno: dataToCash.taxId ?? '',
            saleCode: dataUser.saleCode ?? '',
            saleZone: dataUser.zone ?? '',
            OKFRE1: dataToCash.postCode,
            OKECAR: dataToCash.postCode.slice(0, 2),
            OKCFC4: dataToCash.area ?? '',
            OKTOWN: dataToCash.province,
            shippings: dataToCash.shippingAddress.map(u => {
                return {
                    shippingAddress1: (u.address ?? '').substring(0, 35),
                    shippingAddress2: u.district ?? '',
                    shippingAddress3: u.subDistrict ?? '',
                    shippingAddress4: u.province ?? '',
                    shippingPoscode: u.postCode ?? '',
                    shippingPhone: dataToCash.tel ?? '',
                    shippingRoute: u.postCode,
                    OPGEOX: u.latitude,
                    OPGEOY: u.longtitude
                }
            })
        }


        if (dataToCash.area != 'IT211') {
            try {
                const response = await axios.post(
                    `${process.env.API_URL_12ERP}/customer/insert`,
                    dataTran
                )

                // ส่งกลับไปให้ client ที่เรียก Express API
                return res.status(response.status).json(response.data)
            } catch (error) {
                if (error.response) {
                    // หาก ERP ส่ง 400 หรือ 500 หรืออื่นๆ กลับมา
                    return res.status(error.response.status).json({
                        message: error.response.data?.message || 'Request Failed',
                        data: error.response.data
                    })
                }
            }
        }



        res.status(201).json({
            status: 201,
            message: 'addStorePcToCash',
            data: storesPc,
            dataCash: dataToCash
        })
    } catch (error) {
        console.error(error)
        res.status(500).json({ status: 500, message: error.message })
    }
}


exports.updateStoreRouteAreaFromM3 = async (req, res) => {
    try {
        const channel = req.headers['x-channel']
        const { Store } = getModelsByChannel(channel, res, storeModel)

        // const storeData = await Store.find().
        const storeDataM3 = await Customer.findAll({
            attributes: ['customerNo', 'OKCFC1', 'OKCFC3'],
            raw: true
        })

        const trimmedData = storeDataM3.map(row => ({
            customerNo: row.customerNo?.trim(),
            area: row.OKCFC1?.trim(),
            zone: row.OKCFC1?.trim().slice(0, 2),
            route: row.OKCFC3?.trim()
        }))

        const bulkOps = trimmedData.map(row => ({
            updateMany: {
                filter: { storeId: row.customerNo },
                update: {
                    $set: {
                        area: row.area,
                        zone: row.zone,
                        route: row.route
                    }
                }
            }
        }))

        await Store.bulkWrite(bulkOps)


        res.status(200).json({
            status: 200,
            message: 'update success',
            data: trimmedData
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ status: 500, message: error.message })
    }
}


exports.requestStoreUpdate = async (req, res) => {
    // const { storeId, name, taxId, tel, address, subDistrict, district, province, provinceCode, postCode, user } = req.body

    try {
        const storeId = req.body.storeId
        const data = req.body
        Object.keys(data).forEach(key => {
            if (data[key] === '' || data[key] === null || data[key] === undefined) {
                delete data[key]
            }
        })

        if (!data.user) {
            return res.status(401).json({
                status: 401,
                message: 'user is required'
            })
        }

        const channel = req.headers['x-channel']
        const { Store, StoreHisLog } = getModelsByChannel(channel, res, storeModel)

        // 1) ดึงข้อมูลเดิม
        const oldStore = await Store.findOne({ storeId: storeId })

        // if (oldStore.area !== 'IT211') {
        //   const m3Store = await Customer.findOne({
        //     where: {
        //       coNo: 410,
        //       customerNo: storeId
        //     }
        //   })

        //   if (!m3Store) {
        //     return res.status(404).json({
        //       status: 404,
        //       message: 'Store not found in M3'
        //     })
        //   }
        // }

        if (!oldStore) {
            return res
                .status(404)
                .json({ status: '404', message: 'Store not found mongo' })
        }

        const editableFields = [
            'storeId',
            'name',
            'taxId',
            'tel',
            'address',
            'subDistrict',
            'district',
            'province',
            'provinceCode',
            'postCode'
        ]

        // History ที่จะบันทึก
        const history = {
            editPerson: req.user,
            editAt: new Date()
        }

        // ตรวจว่า field ไหนมีการแก้จริง
        editableFields.forEach(field => {
            const oldVal = oldStore[field]
            const newVal = data[field]

            // เงื่อนไข: มีค่าใหม่ + ไม่เท่าค่าเก่า = ถือว่าแก้ไข
            if (
                newVal !== undefined &&
                newVal !== null &&
                newVal !== '' &&
                newVal !== oldVal
            ) {
                history[field] = newVal
                history[field + 'Old'] = oldVal
            }
        })

        const editPerson = data.user
        // console.log(editPerson)
        // ถ้าไม่มีฟิลด์ไหนถูกแก้ → แจ้งว่าไม่มีการเปลี่ยนแปลง
        if (Object.keys(history).length === 2) {
            // มีแค่ editPerson + editAt
            return res.status(400).json({
                status: '400',
                message: 'Nothing changed'
            })
        }

        // console.log('data', data)

        // อัปเดตร้าน
        // const updatedStore = await Store.findOneAndUpdate(
        //   { storeId: storeId },
        //   { $set: data },
        //   { new: true }
        // )

        const updatedStore = await Store.findOne({ storeId: storeId })

        delete history.editPerson

        const number = await getNextStoreEditNumber(channel, res)


        const historyFinal = {
            number: number,
            storeId,
            // editPerson,
            period: period(),
            status: 'pending',
            statusTH: 'รออนุมัติ',
            ...history
        }

        // บันทึกประวัติการแก้ไข
        await StoreHisLog.create(historyFinal)

        const updateData = {}

        // ---- NAME ----
        if (data.name) {
            const nameStr = updatedStore.name ?? ''
            updateData.OKALCU = nameStr.slice(0, 10)
            updateData.customerName = nameStr.slice(0, 36)
            updateData.customerAddress4 = nameStr.slice(36, 72)
        }

        if (data.taxId) {
            updateData.taxno = data.taxId
        }

        if (data.tel) {
            updateData.customerPhone = data.tel
        }

        // ---- ADDRESS ----
        if (data.address || data.subDistrict || data.province || data.postCode) {
            const fullAddress =
                (updatedStore.address ?? '') +
                '' +
                (updatedStore.subDistrict ?? '') +
                '' +
                (updatedStore.province ?? '') +
                '' +
                (updatedStore.postCode ?? '')

            updateData.customerAddress1 = fullAddress.slice(0, 35)
            updateData.customerAddress2 = fullAddress.slice(35, 70)
            updateData.customerAddress3 = fullAddress.slice(70, 105)
        }

        // ---- UPDATE ครั้งเดียว ----
        // await Customer.update(updateData, {
        //   where: {
        //     coNo: 410,
        //     customerNo: storeId
        //   }
        // })

        res.status(200).json({
            status: '201',
            message: 'Store updated successfully',
            data: updatedStore
        })
    } catch (error) {
        console.error(error)
        res.status(500).json({ status: '500', message: 'Server error' })
    }
}


exports.approveRequestStoreUpdate = async (req, res) => {
    try {
        const channel = req.headers['x-channel']
        const { Store, StoreHisLog } = getModelsByChannel(channel, res, storeModel)
        const { number, period, status, editPerson } = req.body

        const exitsHis = await StoreHisLog.findOne({
            number,
            period,
            status: 'pending'
        })

        if (!exitsHis) {
            return res.status(404).json({
                status: 404,
                message: 'Request not found or already processed'
            })
        }

        // ❌ reject
        if (status !== true) {
            await exitsHis.updateOne({
                $set: {
                    status: 'canceled',
                    statusTH: 'ไม่อนุมัติ',
                    editPerson
                }
            })

            return res.status(200).json({
                status: 200,
                message: 'Rejected'
            })
        }

        // -----------------------
        // UPDATE STORE
        // -----------------------
        const updateStoreData = {}

        const fields = [
            'name',
            'taxId',
            'tel',
            'address',
            'subDistrict',
            'district',
            'province',
            'provinceCode',
            'postCode'
        ]

        for (const field of fields) {
            if (exitsHis[field] !== undefined) {
                updateStoreData[field] = exitsHis[field]
            }
        }

        const updatedStore = await Store.findOneAndUpdate(
            { storeId: exitsHis.storeId },
            { $set: updateStoreData },
            { new: true }
        )

        if (!updatedStore) {
            return res.status(404).json({
                status: 404,
                message: 'Store not found'
            })
        }

        // -----------------------
        // UPDATE M3 (Customer)
        // -----------------------
        const updateData = {}

        if (updatedStore.name) {
            const nameStr = updatedStore.name
            updateData.OKALCU = nameStr.slice(0, 10)
            updateData.customerName = nameStr.slice(0, 36)
            updateData.customerAddress4 = nameStr.slice(36, 72)
        }

        if (updatedStore.taxId) {
            updateData.taxno = updatedStore.taxId
        }

        if (updatedStore.tel) {
            updateData.customerPhone = updatedStore.tel
        }

        if (
            updatedStore.address ||
            updatedStore.subDistrict ||
            updatedStore.province ||
            updatedStore.postCode
        ) {
            const fullAddress =
                (updatedStore.address ?? '') +
                (updatedStore.subDistrict ?? '') +
                (updatedStore.province ?? '') +
                (updatedStore.postCode ?? '')

            updateData.customerAddress1 = fullAddress.slice(0, 35)
            updateData.customerAddress2 = fullAddress.slice(35, 70)
            updateData.customerAddress3 = fullAddress.slice(70, 105)
        }

        if (Object.keys(updateData).length > 0) {
            await Customer.update(updateData, {
                where: {
                    coNo: 410,
                    customerNo: exitsHis.storeId
                }
            })
        }

        // -----------------------
        // UPDATE HISTORY STATUS
        // -----------------------
        await exitsHis.updateOne({
            $set: {
                status: 'approved',
                statusTH: 'อนุมัติ',
                editPerson
            }
        })

        res.status(200).json({
            status: 200,
            message: 'Approved'
        })
    } catch (error) {
        console.error(error)
        res.status(500).json({
            status: 500,
            message: 'Server error'
        })
    }
}

exports.getBk228OldStore = async (req, res) => {
    try {
        const channel = req.headers['x-channel']
        const { Store } = getModelsByChannel(channel, res, storeModel)

        const dateLimit = new Date('2026-01-02T00:00:00+07:00')

        const [dataBk228, dataAll] = await Promise.all([
            Store.find(
                { area: 'BK228', createdAt: { $lt: dateLimit } },
                'storeId name createdAt province tel type typeName address subDistrict district provinceCode taxId latitude longtitude'
            ).lean(),
            Store.find(
                { area: { $nin: ['BK228', 'IT211'] }, createdAt: { $lt: dateLimit } },
                'storeId name createdAt province area tel type address subDistrict district provinceCode taxId latitude longtitude'
            ).lean()
        ])

        // -------- helper --------
        const normalize = v => (v ?? '').toString().trim()
        const normalizeDate = d =>
            d instanceof Date ? d.toISOString().slice(0, 10) : normalize(d)

        const isMatch = (a, b) =>
            normalize(a.name) === normalize(b.name) &&
            normalizeDate(a.createdAt) === normalizeDate(b.createdAt) &&
            normalize(a.tel) === normalize(b.tel) &&
            normalize(a.type) === normalize(b.type) &&
            normalize(a.address) === normalize(b.address) &&
            normalize(a.subDistrict) === normalize(b.subDistrict) &&
            normalize(a.district) === normalize(b.district) &&
            normalize(a.provinceCode) === normalize(b.provinceCode) &&
            normalize(a.taxId) === normalize(b.taxId)

        const data = []
        const missing = []
        const multiple = []

        // -------- main loop --------
        for (const item of dataBk228) {
            const matches = dataAll.filter(u => isMatch(item, u))

            if (matches.length === 0) {
                missing.push({
                    storeId: item.storeId,
                    name: item.name,
                    createdAt: item.createdAt
                })
                continue
            }

            if (matches.length > 1) {
                multiple.push({
                    storeIdBk228: item.storeId,
                    name: item.name,
                    count: matches.length,
                    candidates: matches.map(m => ({
                        storeId: m.storeId,
                        area: m.area
                    }))
                })
                continue
            }

            // ✅ match ได้ 1 ร้านพอดี
            const exitsStore = matches[0]

            data.push({
                StoreIDBk228: item.storeId,
                storeOld: exitsStore.storeId,
                areaOld: exitsStore.area
            })
        }
        const storeOldCount = new Map()

        for (const row of data) {
            storeOldCount.set(
                row.storeOld,
                (storeOldCount.get(row.storeOld) || 0) + 1
            )
        }


        const duplicatedStoreOld = []

        for (const [storeOld, count] of storeOldCount.entries()) {
            if (count > 1) {
                duplicatedStoreOld.push({
                    storeOld,
                    count,
                    bk228Stores: data
                        .filter(d => d.storeOld === storeOld)
                        .map(d => d.StoreIDBk228)
                })
            }
        }
        console.log('❗ duplicated storeOld:', duplicatedStoreOld.length)
        console.table(duplicatedStoreOld)


        const wb = xlsx.utils.book_new()

        // แปลง data เป็น worksheet
        const ws = xlsx.utils.json_to_sheet(data)

        // เพิ่ม sheet เข้า workbook
        xlsx.utils.book_append_sheet(wb, ws, 'sheet')

        // path ไฟล์ชั่วคราว
        const tempPath = path.join(os.tmpdir(), 'OldBk228.xlsx')

        // เขียนไฟล์
        xlsx.writeFile(wb, tempPath)

        // ส่งไฟล์ให้ client ดาวน์โหลด
        res.download(tempPath, 'OldBk228.xlsx', err => {
            if (err) {
                console.error('❌ Download error:', err)
                // อย่าส่ง response ซ้ำถ้า header ถูกส่งไปแล้ว
                if (!res.headersSent) {
                    res.status(500).send('Download failed')
                }
            }

            // ✅ ลบไฟล์ทิ้งหลังส่งเสร็จ (หรือส่งไม่สำเร็จ)
            fs.unlink(tempPath, () => { })
        })


        // res.status(200).json({
        //     status: 200,
        //     message: 'getBk228OldStore',
        //     totalBk228: dataBk228.length,
        //     matched: data.length,
        //     missing: missing.length,
        //     multiple: multiple.length,
        //     data,
        //     missing,
        //     multiple
        // })
    } catch (error) {
        console.error(error)
        res.status(500).json({
            status: 500,
            message: 'Server error'
        })
    }
}
