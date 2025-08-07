const moment = require('moment')
// const { Order } = require('../models/cash/sale')
// const { Refund } = require('../models/cash/refund')
// const { Distribution } = require('../models/cash/distribution')
// const { Giveaway, Givetype } = require('../models/cash/give')
// const { Promotion } = require('../models/cash/promotion')

const orderModel = require('../models/cash/sale')
const refundModel = require('../models/cash/refund')
const distributionModel = require('../models/cash/distribution')
const giveawayModel = require('../models/cash/give')
const stockModel = require('../models/cash/stock')
const promotionModel = require('../models/cash/promotion')
const campaignModel = require('../models/cash/campaign')
const { getModelsByChannel } = require('../middleware/channel')
// const { sequelize, DataTypes } = require('../config/m3db')
const { Op } = require('sequelize')

const { DisributionM3 } = require('../models/cash/master')

async function generateCampaignId (channel, res) {
  const { Campaign } = getModelsByChannel(channel, res, campaignModel)
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const dateStr = `${yyyy}${mm}${dd}`

  // หารหัสล่าสุดที่ขึ้นต้นด้วย CAM-YYYYMMDD-
  const regex = new RegExp(`^CAM-${dateStr}-(\\d{3})$`)

  const latest = await Campaign.findOne({ id: { $regex: regex } })
    .sort({ id: -1 })
    .lean()

  let nextNumber = 1

  if (latest) {
    // ดึงเลขลำดับสุดท้าย
    const match = latest.id.match(/(\d{3})$/)
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1
    }
  }

  const nextNumberStr = String(nextNumber).padStart(3, '0')
  const newId = `CAM-${dateStr}-${nextNumberStr}`
  return newId
}

const generateStockId = async (area, warehouse, channel, res) => {
  const currentYear = new Date().getFullYear() + 543
  const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0')

  const { AdjustStock } = getModelsByChannel(channel, res, stockModel)

  const latestOrder = await AdjustStock.findOne({
    area: area,
    createdAt: {
      $gte: new Date(`${new Date().getFullYear()}-${currentMonth}-01`),
      $lt: new Date(
        `${new Date().getFullYear()}-${parseInt(currentMonth) + 1}-01`
      )
    },
    status: { $ne: 'canceled' }
  })
    .sort({ orderId: -1 })
    .select('orderId')

  let runningNumber = latestOrder
    ? parseInt(latestOrder.orderId.slice(-4)) + 1
    : 1

  return `S${currentYear
    .toString()
    .slice(2, 4)}${currentMonth}13${warehouse}${runningNumber
    .toString()
    .padStart(4, '0')}`
}

const generateOrderId = async (area, warehouse, channel, res) => {
  const currentYear = new Date().getFullYear() + 543
  const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0')

  const { Order } = getModelsByChannel(channel, res, orderModel)

  const latestOrder = await Order.findOne({
    'store.area': area,
    createdAt: {
      $gte: new Date(`${new Date().getFullYear()}-${currentMonth}-01`),
      $lt: new Date(
        `${new Date().getFullYear()}-${parseInt(currentMonth) + 1}-01`
      )
    },
    status: { $ne: 'canceled' }
  })
    .sort({ orderId: -1 })
    .select('orderId')

  let runningNumber = latestOrder
    ? parseInt(latestOrder.orderId.slice(-4)) + 1
    : 1

  return `${currentYear
    .toString()
    .slice(2, 4)}${currentMonth}13${warehouse}${runningNumber
    .toString()
    .padStart(4, '0')}`
}
const generateRefundId = async (area, warehouse, channel, res) => {
  const currentYear = new Date().getFullYear() + 543
  const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0')

  const { Refund } = getModelsByChannel(channel, res, refundModel)

  const latestOrder = await Refund.findOne({
    'store.area': area,
    createdAt: {
      $gte: new Date(`${new Date().getFullYear()}-${currentMonth}-01`),
      $lt: new Date(
        `${new Date().getFullYear()}-${parseInt(currentMonth) + 1}-01`
      )
    }
    // ,status: { $ne: 'canceled' }
  })
    .sort({ orderId: -1 })
    .select('orderId')

  let runningNumber = latestOrder
    ? parseInt(latestOrder.orderId.slice(-4)) + 1
    : 1

  return `${currentYear
    .toString()
    .slice(2, 4)}${currentMonth}93${warehouse}${runningNumber
    .toString()
    .padStart(4, '0')}`
}

const generateDistributionId = async (area, warehouse, channel, res) => {
  const now = new Date()
  const currentYear = now.getFullYear() + 543
  const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0')

  const { Distribution } = getModelsByChannel(channel, res, distributionModel)

  // สร้าง prefix เช่น "W680852221"
  const prefix = `W${currentYear
    .toString()
    .slice(2, 4)}${currentMonth}${warehouse}`

  // หาเลขล่าสุดใน DisributionM3 ที่ขึ้นต้นด้วย prefix
  const lastM3 = await DisributionM3.findOne({
    attributes: ['MGTRNR'],
    where: {
      MGTRNR: {
        [Op.like]: `${prefix}%`
      }
    },
    order: [['MGTRNR', 'DESC']],
    raw: true
  })
  // console.log("lastM3", lastM3)
  // หาเลขล่าสุดใน Distribution ปกติ (optional ตามโค้ดเดิม)
  const latestOrder = await Distribution.findOne({
    area,
    createdAt: {
      $gte: new Date(`${new Date().getFullYear()}-${currentMonth}-01`),
      $lt: new Date(
        `${new Date().getFullYear()}-${parseInt(currentMonth) + 1}-01`
      )
    }
  })
    .sort({ orderId: -1 })
    .select('orderId')
  // console.log("latestOrder", latestOrder)
  // เช็คเลขรันล่าสุดจาก M3
  let runningNumber = 0
  // if (lastM3 && lastM3.MGTRNR) {
  // if (lastM3 && lastM3.MGTRNR) {
  //   // ดึง 2 หลักสุดท้าย (หรือจะปรับให้มากกว่านี้ก็ได้)
  //   const lastNum = parseInt(lastM3.MGTRNR.slice(-2))
  //   runningNumber = isNaN(lastNum) ? 0 : lastNum + 1
  //   console.log("sssssssssssss")
  // } else if (latestOrder) {
  if (latestOrder) {
    runningNumber = parseInt(latestOrder.orderId.slice(-2)) + 1
  }

  const newOrderId = `${prefix}${runningNumber.toString().padStart(2, '0')}`
  return newOrderId
}

const generateGiveawaysId = async (area, warehouse, channel, res) => {
  const currentYear = new Date().getFullYear() + 543
  const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0')

  const { Giveaway } = getModelsByChannel(channel, res, giveawayModel)
  const latestOrder = await Giveaway.findOne({
    'store.area': area,
    createdAt: {
      $gte: new Date(`${new Date().getFullYear()}-${currentMonth}-01`),
      $lt: new Date(
        `${new Date().getFullYear()}-${parseInt(currentMonth) + 1}-01`
      )
    }
    // ,status: { $ne: 'canceled' }
  })
    .sort({ orderId: -1 })
    .select('orderId')

  let runningNumber = latestOrder
    ? parseInt(latestOrder.orderId.slice(-2)) + 1
    : 1

  return `P${currentYear
    .toString()
    .slice(2, 4)}${currentMonth}${warehouse}${runningNumber
    .toString()
    .padStart(2, '0')}`
}

const generateGivetypeId = async (channel, res) => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')

  const { Givetype } = getModelsByChannel(channel, res, giveawayModel)

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

const generatePromotionId = async (channel, res) => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')

  const { Promotion } = getModelsByChannel(channel, res, promotionModel)

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

module.exports = {
  generateOrderId,
  generateRefundId,
  generateDistributionId,
  generateGiveawaysId,
  generateGivetypeId,
  generatePromotionId,
  generateStockId,
  generateCampaignId
}
