const moment = require('moment')
const { Order } = require('../models/cash/sale')
const { Refund } = require('../models/cash/refund')
const { Distribution } = require('../models/cash/distribution')
const { Giveaways, Givetype } = require('../models/cash/give')
const { Promotion } = require('../models/cash/promotion')

const generateOrderId = async (area, warehouse) => {
    const currentYear = new Date().getFullYear() + 543
    const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0')

    const latestOrder = await Order.findOne({
        "store.area": area,
        createdAt: {
            $gte: new Date(`${new Date().getFullYear()}-${currentMonth}-01`),
            $lt: new Date(`${new Date().getFullYear()}-${parseInt(currentMonth) + 1}-01`)
        },
        status: { $ne: 'canceled' }
    }).sort({ orderId: -1 }).select('orderId');

    let runningNumber = latestOrder ? parseInt(latestOrder.orderId.slice(-4)) + 1 : 1

    return `${currentYear.toString().slice(2, 4)}${currentMonth}13${warehouse}${runningNumber.toString().padStart(4, '0')}`
}

const generateRefundId = async (area, warehouse) => {
    const currentYear = new Date().getFullYear() + 543
    const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0')

    const latestOrder = await Refund.findOne({
        "store.area": area,
        createdAt: {
            $gte: new Date(`${new Date().getFullYear()}-${currentMonth}-01`),
            $lt: new Date(`${new Date().getFullYear()}-${parseInt(currentMonth) + 1}-01`)
        },
        status: { $ne: 'canceled' }
    }).sort({ orderId: -1 }).select('orderId');

    let runningNumber = latestOrder ? parseInt(latestOrder.orderId.slice(-4)) + 1 : 1

    return `${currentYear.toString().slice(2, 4)}${currentMonth}93${warehouse}${runningNumber.toString().padStart(4, '0')}`
}

const generateDistributionId = async (area, warehouse) => {
    const now = new Date()
    const currentYear = now.getFullYear() + 543
    const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0')

    const latestOrder = await Distribution.findOne({
        area,
        created: {
            $gte: new Date(`${new Date().getFullYear()}-${currentMonth}-01`),
            $lt: new Date(`${new Date().getFullYear()}-${parseInt(currentMonth) + 1}-01`)
        },
        status: { $ne: 'canceled' }
    })
        .sort({ created: -1 })
        .select('orderId')

    let runningNumber = latestOrder ? parseInt(latestOrder.orderId.slice(-2)) + 1 : 1

    return `W${currentYear.toString().slice(2, 4)}${currentMonth}${warehouse}${runningNumber.toString().padStart(2, '0')}`
}

const generateGiveawaysId = async (area, warehouse) => {
    const currentYear = new Date().getFullYear() + 543
    const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0')

    const latestOrder = await Giveaways.findOne({
        "store.area": area,
        createdAt: {
            $gte: new Date(`${new Date().getFullYear()}-${currentMonth}-01`),
            $lt: new Date(`${new Date().getFullYear()}-${parseInt(currentMonth) + 1}-01`)
        },
        status: { $ne: 'canceled' }
    }).sort({ orderId: -1 }).select('orderId');

    let runningNumber = latestOrder ? parseInt(latestOrder.orderId.slice(-2)) + 1 : 1

    return `P${currentYear.toString().slice(2, 4)}${currentMonth}${warehouse}${runningNumber.toString().padStart(2, '0')}`
}

const generateGivetypeId = async () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')

    const lastGiveId = await Givetype.findOne()
        .sort({ createdAt: -1 })
        .select('giveId')

    let runningNumber = 1
    if (lastGiveId && lastGiveId.giveId.startsWith(`GIVE-${year}${month}`)) {
        const lastNumber = parseInt(lastGiveId.giveId.slice(-4), 10)
        runningNumber = lastNumber + 1
    }

    return `GIVE-${year}${month}-${String(runningNumber).padStart(4, '0')}`
}

const generatePromotionId = async () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')

    const lastPromotion = await Promotion.findOne()
        .sort({ createdAt: -1 })
        .select('proId')

    let runningNumber = 1
    if (lastPromotion && lastPromotion.proId.startsWith(`PRO-${year}${month}`)) {
        const lastNumber = parseInt(lastPromotion.proId.slice(-4), 10)
        runningNumber = lastNumber + 1
    }

    return `PRO-${year}${month}-${String(runningNumber).padStart(4, '0')}`
}

module.exports = { generateOrderId, generateRefundId, generateDistributionId, generateGiveawaysId, generateGivetypeId, generatePromotionId }