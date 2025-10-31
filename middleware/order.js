const { OOTYPE, NumberSeries } = require('../models/cash/master')
const { getModelsByChannel } = require('../middleware/channel')
const cartModel = require('../models/cash/cart')
const storeModel = require('../models/cash/store')
const productModel = require('../models/cash/product')
const orderModel = require('../models/cash/sale')
const DistributionModel = require('../models/cash/distribution')
const refundModel = require('../models/cash/refund')
const stockModel = require('../models/cash/stock')
const nodemailer = require('nodemailer')
const { ITEM_SERVER } = require('../config')
const { STATES } = require('mongoose')
require('dotenv').config()

exports.updateRunningNumber = async (data, transaction) => {
  try {
    const { coNo, lastNo, seriesType, series } = data
    const update = await NumberSeries.update(
      { lastNo: lastNo },
      {
        where: {
          coNo: coNo,
          series: series,
          seriesType: seriesType
        },
        transaction
      }
    )
    return { status: 202, data: update }
  } catch (error) {
    throw console.log(error)
  }
}

exports.getSeries = async orderType => {
  try {
    const response = await OOTYPE.findOne({
      where: {
        OOORTP: orderType
      }
    })
    return response
  } catch (error) {
    throw errorEndpoint(currentFilePath, 'getSeries', error)
  }
}

module.exports.formatDateTimeToThai = function (date) {
  const thDate = new Date(new Date(date).getTime() + 7 * 60 * 60 * 1000)
  const day = String(thDate.getDate()).padStart(2, '0')
  const month = String(thDate.getMonth() + 1).padStart(2, '0')
  const year = thDate.getFullYear()
  const hour = String(thDate.getHours()).padStart(2, '0')
  const minute = String(thDate.getMinutes()).padStart(2, '0')
  const second = String(thDate.getSeconds()).padStart(2, '0')
  return `${day}/${month}/${year} ${hour}:${minute}:${second}`
}

module.exports.to2 = function (num) {
  return Math.round((Number(num) || 0) * 100) / 100
}

module.exports.getQty = async function (data, channel) {
  try {
    const { area, productId, unit, period } = data
    // const channel = req.headers['x-channel']

    const { Stock } = getModelsByChannel(channel, '', stockModel)
    const { Product } = getModelsByChannel(channel, '', productModel)

    // Find product
    const product = await Product.findOne({ id: productId }).lean()

    if (!product) {
      throw new Error('Not Found This ItemId in Product collection')
    }

    const unitData = product.listUnit.map(unit => ({
      unit: unit.unit,
      factor: unit.factor
    }))

    const unitMatch = product.listUnit.find(u => u.unit === unit)
    const factor = unitMatch?.factor ?? 0

    if (!factor || factor <= 0) {
      throw new Error(`Invalid or missing factor for unit "${unit}"`)
    }

    // Find stock entries
    const stockEntries = await Stock.find({
      area,
      period,
      'listProduct.productId': productId
    })

    const stockmatchList = []

    stockEntries.forEach(item => {
      const match = item.listProduct.find(p => p.productId === productId)
      if (match) stockmatchList.push(match)
    })

    if (!stockmatchList.length) {
      throw new Error('Not Found This ItemId in Stock collection')
    }

    // Sum balancePcs
    const totalBalancePcs = stockmatchList.reduce(
      (sum, item) => sum + (item.balancePcs ?? 0),
      0
    )

    const qtyByUnit = Math.floor(totalBalancePcs / factor)

    const dataRes = {
      area,
      productId,
      unit,
      factor,
      sumQtyPcs: totalBalancePcs,
      qty: qtyByUnit,
      unitData
    }

    return dataRes
  } catch (error) {
    console.error('[getQty error]', error)
    // return res.status(500).json({
    //   status: 500,
    //   message: 'Internal server error: ' + error.message
    // })
  }
}

module.exports.getPeriodFromDate = function (createdAt) {
  // รับได้ทั้ง string และ Date object
  const d = createdAt instanceof Date ? createdAt : new Date(createdAt)
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${year}${month}`
}

async function checkProductInStock (Stock, area, period, id) {
  const stock = await Stock.findOne({
    area: area,
    period: period,
    'listProduct.productId': id
  })
  return !!stock
}

module.exports.updateStockMongo = async function (
  data,
  area,
  period,
  type,
  channel,
  stockType = '',
  res = null
) {
  const { id, unit, qty, condition } = data
  // console.log(data)

  const { Stock } = getModelsByChannel(channel, '', stockModel)
  const { Product } = getModelsByChannel(channel, '', productModel)

  // console.log(id,unit,qty,area,period)
  if (!id || !unit || !area || !period) {
    throw new Error('Missing product data (id/unit/qty/area/period)')
  }
  if (qty === undefined || qty === 0) {
    if (res) {
      res.status(409).json({ status: 409, message: 'Stock not enough' })
      return true
    }
    throw new Error('Stock not enough')
  }
  if (qty < 0) {
    if (res) {
      res.status(409).json({ status: 409, message: 'Stock not enough' })
      return true
    }
    throw new Error('qty must > 0')
  }

  // Find product unit factor
  const factorPcsResult = await Product.aggregate([
    { $match: { id: id } },
    {
      $project: {
        id: 1,
        listUnit: {
          $filter: {
            input: '$listUnit',
            as: 'unitItem',
            cond: { $eq: ['$$unitItem.unit', unit] }
          }
        }
      }
    }
  ])
  const factorCtnResult = await Product.aggregate([
    { $match: { id: id } },
    {
      $project: {
        id: 1,
        listUnit: {
          $filter: {
            input: '$listUnit',
            as: 'unitItem',
            cond: { $eq: ['$$unitItem.unit', 'CTN'] }
          }
        }
      }
    }
  ])
  // console.log("factorPcsResult",factorPcsResult)
  const factorCtn = factorCtnResult?.[0]?.listUnit?.[0]?.factor || 0
  const factorPcs = factorPcsResult?.[0]?.listUnit?.[0]?.factor || 0

  const factorPcsQty = qty * factorPcs
  const factorCtnQty = factorCtn > 0 ? Math.floor(factorPcsQty / factorCtn) : 0

  // console.log('factorCtn', factorCtn)
  // console.log('factorPcs', factorPcs)
  // console.log('factorPcsQty', factorPcsQty)
  // console.log('factorCtnQty', factorCtnQty)
  // console.log('id', id)

  if (factorPcs === 0)
    throw new Error('Cannot find product unit factor for PCS')
  if (
    ![
      'sale',
      'withdraw',
      'give',
      'deleteCart',
      'orderCanceled',
      'adjust',
      'addproduct',
      'refund',
      'change',
      'rufundCanceled',
      'promotion',
      'approvedAdjustStockReduce',
      'approvedAdjustStockAdd',
      'approvedChangeOrder',
      'adjustWithdraw',
      'reduceWithdraw'
    ].includes(type)
  )
    throw new Error('Invalid stock update type: ' + type)

  // Utility: Check enough balance before deduct
  async function checkBalanceEnough (area, period, id, pcsNeed) {
    const stockDoc = await Stock.findOne(
      { area, period, 'listProduct.productId': id },
      { 'listProduct.$': 1 }
    )
    const balance = stockDoc?.listProduct?.[0]?.balancePcs || 0
    return balance >= pcsNeed
  }

  // === Logic for each type ===
  if (type === 'sale' || type === 'give' || type === 'change') {
    // Out: Reduce stock
    // const enough = await checkBalanceEnough(area, period, id, factorPcsQty)
    // if (!enough) {
    //   if (res) {
    //     res.status(409).json({ status: 409, message: 'Stock not enough' })
    //     return true
    //   }
    //   throw new Error('Stock not enough')
    // }
    try {
      await Stock.findOneAndUpdate(
        {
          area: area,
          period: period,
          'listProduct.productId': id
        },
        {
          $inc: {
            'listProduct.$[elem].stockOutPcs': +factorPcsQty,
            'listProduct.$[elem].stockOutCtn': +factorCtnQty
            // 'listProduct.$[elem].balancePcs': -factorPcsQty,
            // 'listProduct.$[elem].balanceCtn': -factorCtnQty
          }
        },
        {
          arrayFilters: [{ 'elem.productId': id }],
          new: true
        }
      )
    } catch (err) {
      throw new Error('Error updating stock for sale/give: ' + err.message)
    }
  } else if (type === 'withdraw') {
    // In: Increase stock
    try {
      const existsProduct = await Stock.aggregate([
        {
          $match: {
            area: area,
            period: period,
            'listProduct.productId': id
          }
        }
      ])
      if (existsProduct.length > 0) {
        await Stock.findOneAndUpdate(
          {
            area: area,
            period: period,
            'listProduct.productId': id
          },
          {
            $inc: {
              'listProduct.$[elem].stockInPcs': +factorPcsQty,
              'listProduct.$[elem].stockInCtn': +factorCtnQty,
              'listProduct.$[elem].balancePcs': +factorPcsQty,
              'listProduct.$[elem].balanceCtn': +factorCtnQty
            }
          },
          {
            arrayFilters: [{ 'elem.productId': id }],
            new: true
          }
        )
      } else {
        const newProduct = {
          productId: id,
          stockPcs: 0,
          stockInPcs: factorPcsQty,
          stockOutPcs: 0,
          balancePcs: factorPcsQty,
          stockCtn: 0,
          stockInCtn: factorCtnQty,
          stockOutCtn: 0,
          balanceCtn: factorCtnQty
        }
        await Stock.findOneAndUpdate(
          { area: area, period: period },
          { $push: { listProduct: newProduct } },
          { upsert: true, new: true }
        )
      }
    } catch (err) {
      throw new Error('Error updating stock for withdraw: ' + err.message)
    }
  } else if (type === 'deleteCart') {
    // In: Increase stock (return cart to stock)
    try {
      await Stock.findOneAndUpdate(
        {
          area: area,
          period: period,
          'listProduct.productId': id
        },
        {
          $inc: {
            'listProduct.$[elem].balancePcs': +factorPcsQty,
            'listProduct.$[elem].balanceCtn': +factorCtnQty
          }
        },
        {
          arrayFilters: [{ 'elem.productId': id }],
          new: true
        }
      )
    } catch (err) {
      throw new Error('Error updating stock for deleteCart: ' + err.message)
    }
  } else if (type === 'promotion') {
    // In: Increase stock (return cart to stock)

    console.log(id, factorPcsQty)

    try {
      await Stock.findOneAndUpdate(
        {
          area: area,
          period: period,
          'listProduct.productId': id
        },
        {
          $inc: {
            'listProduct.$[elem].stockOutPcs': +factorPcsQty,
            'listProduct.$[elem].stockOutCtn': +factorCtnQty,
            'listProduct.$[elem].balancePcs': -factorPcsQty,
            'listProduct.$[elem].balanceCtn': -factorCtnQty
          }
        },
        {
          arrayFilters: [{ 'elem.productId': id }],
          new: true
        }
      )
    } catch (err) {
      throw new Error('Error updating stock for deleteCart: ' + err.message)
    }
  } else if (type === 'orderCanceled') {
    // In: Cancel sale (return to stock)
    try {
      await Stock.findOneAndUpdate(
        {
          area: area,
          period: period,
          'listProduct.productId': id
        },
        {
          $inc: {
            'listProduct.$[elem].stockOutPcs': -factorPcsQty,
            'listProduct.$[elem].balancePcs': +factorPcsQty,
            'listProduct.$[elem].stockOutCtn': -factorCtnQty,
            'listProduct.$[elem].balanceCtn': +factorCtnQty
          }
        },
        {
          arrayFilters: [{ 'elem.productId': id }],
          new: true
        }
      )
    } catch (err) {
      throw new Error('Error updating stock for orderCanceled: ' + err.message)
    }
  } else if (type === 'adjust' || type === 'addproduct') {
    // Flexible: IN/OUT
    const found = await checkProductInStock(Stock, area, period, id)
    if (!found)
      throw new Error(
        `Product id:${id} not found in stock for area:${area} period:${period}`
      )
    // OUT: เช็คพอก่อน
    if (stockType === 'OUT') {
      const enough = await checkBalanceEnough(area, period, id, factorPcsQty)
      if (!enough) {
        if (res) {
          res.status(409).json({ status: 409, message: 'Stock not enough' })
          return true
        }
        throw new Error('Stock not enough')
      }
    }
    let incObj = {}
    if (stockType === 'IN') {
      incObj['listProduct.$[elem].balancePcs'] = +factorPcsQty
      incObj['listProduct.$[elem].balanceCtn'] = +factorCtnQty
    } else if (stockType === 'OUT') {
      incObj['listProduct.$[elem].balancePcs'] = -factorPcsQty
      incObj['listProduct.$[elem].balanceCtn'] = -factorCtnQty
    }

    if (Object.keys(incObj).length > 0) {
      await Stock.findOneAndUpdate(
        {
          area: area,
          period: period,
          'listProduct.productId': id
        },
        { $inc: incObj },
        {
          arrayFilters: [{ 'elem.productId': id }],
          new: true
        }
      )
    }
  } else if (type === 'adjustWithdraw') {
    const found = await checkProductInStock(Stock, area, period, id)
    if (!found)
      throw new Error(
        `Product id:${id} not found in stock for area:${area} period:${period}`
      )
    let incObj = {}
    if (stockType === 'IN') {
      incObj['listProduct.$[elem].balancePcs'] = +factorPcsQty
      incObj['listProduct.$[elem].balanceCtn'] = +factorCtnQty
    } else if (stockType === 'OUT') {
      incObj['listProduct.$[elem].balancePcs'] = -factorPcsQty
      incObj['listProduct.$[elem].balanceCtn'] = -factorCtnQty
    }

    if (Object.keys(incObj).length > 0) {
      await Stock.findOneAndUpdate(
        {
          area: area,
          period: period,
          'listProduct.productId': id
        },
        { $inc: incObj },
        {
          arrayFilters: [{ 'elem.productId': id }],
          new: true
        }
      )
    }
  } else if (type === 'refund') {
    // In: เพิ่ม stock จากคืนสินค้า
    const found = await checkProductInStock(Stock, area, period, id)
    if (!found)
      throw new Error(
        `Product id:${id} not found in stock for area:${area} period:${period}`
      )
    // ถ้ามี condition ให้ใช้เพิ่ม logic ได้
    if (type === 'refund' && condition !== 'good') return
    try {
      await Stock.findOneAndUpdate(
        {
          area: area,
          period: period,
          'listProduct.productId': id
        },
        {
          $inc: {
            'listProduct.$[elem].stockInPcs': +factorPcsQty,
            'listProduct.$[elem].balancePcs': +factorPcsQty,
            'listProduct.$[elem].stockInCtn': +factorCtnQty,
            'listProduct.$[elem].balanceCtn': +factorCtnQty
          }
        },
        {
          arrayFilters: [{ 'elem.productId': id }],
          new: true
        }
      )
    } catch (err) {
      throw new Error('Error updating stock for refund: ' + err.message)
    }
  } else if (type === 'rufundCanceled') {
    // In: คืน stock ที่ถูก cancel คืนยอดให้
    const found = await checkProductInStock(Stock, area, period, id)
    if (!found)
      throw new Error(
        `Product id:${id} not found in stock for area:${area} period:${period}`
      )
    try {
      await Stock.findOneAndUpdate(
        {
          area: area,
          period: period,
          'listProduct.productId': id
        },
        {
          $inc: {
            'listProduct.$[elem].balancePcs': +factorPcsQty,
            'listProduct.$[elem].balanceCtn': +factorCtnQty
          }
        },
        {
          arrayFilters: [{ 'elem.productId': id }],
          new: true
        }
      )
    } catch (err) {
      throw new Error('Error updating stock for rufundCanceled: ' + err.message)
    }
  } else if (type === 'approvedAdjustStockReduce') {
    const found = await checkProductInStock(Stock, area, period, id)
    if (!found)
      throw new Error(
        `Product id:${id} not found in stock for area:${area} period:${period}`
      )
    try {
      await Stock.findOneAndUpdate(
        {
          area: area,
          period: period,
          'listProduct.productId': id
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
          arrayFilters: [{ 'elem.productId': id }],
          new: true
        }
      )
    } catch (err) {
      throw new Error('Error updating stock for rufundCanceled: ' + err.message)
    }
  } else if (type === 'approvedAdjustStockAdd') {
    const found = await checkProductInStock(Stock, area, period, id)
    if (!found)
      throw new Error(
        `Product id:${id} not found in stock for area:${area} period:${period}`
      )
    try {
      await Stock.findOneAndUpdate(
        {
          area: area,
          period: period,
          'listProduct.productId': id
        },
        {
          $inc: {
            'listProduct.$[elem].stockInPcs': +factorPcsQty,
            'listProduct.$[elem].balancePcs': +factorPcsQty,
            'listProduct.$[elem].stockInCtn': +factorCtnQty,
            'listProduct.$[elem].balanceCtn': +factorCtnQty
          }
        },
        {
          arrayFilters: [{ 'elem.productId': id }],
          new: true
        }
      )
    } catch (err) {
      throw new Error('Error updating stock for rufundCanceled: ' + err.message)
    }
  } else if (type === 'reduceWithdraw') {
    const found = await checkProductInStock(Stock, area, period, id)
    if (!found)
      throw new Error(
        `Product id:${id} not found in stock for area:${area} period:${period}`
      )
    try {
      await Stock.findOneAndUpdate(
        {
          area: area,
          period: period,
          'listProduct.productId': id
        },
        {
          $inc: {
            'listProduct.$[elem].stockInPcs': -factorPcsQty,
            'listProduct.$[elem].balancePcs': -factorPcsQty,
            'listProduct.$[elem].stockInCtn': -factorCtnQty,
            'listProduct.$[elem].balanceCtn': -factorCtnQty
          }
        },
        {
          arrayFilters: [{ 'elem.productId': id }],
          new: true
        }
      )
    } catch (err) {
      throw new Error('Error updating stock for rufundCanceled: ' + err.message)
    }
  }
}

module.exports.sendEmail = async function ({ to, cc, subject, html }) {
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false, // ใช้ STARTTLS
      auth: {
        user: process.env.MY_MAIL_USER, // เช่น your_email@outlook.com
        pass: process.env.MY_MAIL_PASS
      }
    })

    const info = await transporter.sendMail({
      from: `"it test" <${process.env.MY_MAIL_USER}>`, // ผู้ส่งต้องเป็น email ที่คุณใช้จริง
      to,
      cc,
      subject,
      html
    })

    console.log('✅ Email sent:', info.messageId)
  } catch (err) {
    console.error('❌ Failed to send email:', err.message)
  }
}
function calculateStockSummary (productDetail, listUnitStock) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const dates = []

  while (start <= end) {
    const year = start.getFullYear()
    const month = String(start.getMonth() + 1).padStart(2, '0')
    const day = String(start.getDate()).padStart(2, '0')
    dates.push(`${year}-${month}-${day}`)
    start.setDate(start.getDate() + 1)
  }

  return dates
}

function calculateStockSummary (productDetail, listUnitStock) {
  // helper เอา factor ของหน่วยจาก productDetail.listUnit
  const getFactor = unit => {
    const unitObj = productDetail.listUnit.find(item => item.unit === unit)
    return unitObj ? Number(unitObj.factor) || 0 : 0
  }

  // รวมเป็น PCS ของแต่ละฟิลด์ ด้วย factor ของหน่วยนั้น ๆ
  const sumPCS = field =>
    listUnitStock.reduce((sum, u) => {
      const factor = getFactor(u.unit)
      const qty = Number(u?.[field]) || 0
      return sum + factor * qty
    }, 0)

  // รวมค่าเป็น PCS
  const totalStockPCS = sumPCS('stock')
  const totalStockWithdrawPCS = sumPCS('withdraw')
  const totalStockGoodPCS = sumPCS('good')
  const totalStockDamagedPCS = sumPCS('damaged')
  const totalStockSalePCS = sumPCS('sale')
  const totalStockPromotionPCS = sumPCS('promotion')
  const totalStockChangePCS = sumPCS('change')
  const totalStockAdjustPCS = sumPCS('adjust')
  const totalStockGivePCS = sumPCS('give')
  const totalStockCartPCS = sumPCS('cart')
  const totalStockChangePendingPCS = sumPCS('changePending')

  const inPCS = totalStockWithdrawPCS + totalStockGoodPCS
  const outPCS =
    totalStockSalePCS +
    totalStockPromotionPCS +
    totalStockChangePCS +
    totalStockAdjustPCS +
    totalStockGivePCS
  const stockWithInPCS = totalStockPCS + inPCS
  const balancePCS =
    stockWithInPCS - outPCS - totalStockCartPCS - totalStockChangePendingPCS

  // ผลลัพธ์หน่วย PCS
  const resultPCS = {
    unit: 'PCS',
    stock: totalStockPCS,
    withdraw: totalStockWithdrawPCS,
    good: totalStockGoodPCS,
    damaged: totalStockDamagedPCS,
    sale: totalStockSalePCS,
    cart: totalStockCartPCS,
    promotion: totalStockPromotionPCS,
    change: totalStockChangePCS,
    changePending: totalStockChangePendingPCS,
    adjust: totalStockAdjustPCS,
    give: totalStockGivePCS,
    in: inPCS,
    stockWithIn: stockWithInPCS,
    out: outPCS,
    balance: balancePCS
  }

  // แปลงเป็น CTN โดยปัดลง
  const factorCTN = getFactor('CTN')
  const toCTN = pcs => (factorCTN > 0 ? Math.floor(pcs / factorCTN) : 0)

  const resultCTN = {
    unit: 'CTN',
    stock: toCTN(totalStockPCS),
    withdraw: toCTN(totalStockWithdrawPCS),
    good: toCTN(totalStockGoodPCS),
    damaged: toCTN(totalStockDamagedPCS),
    sale: toCTN(totalStockSalePCS),
    cart: toCTN(totalStockCartPCS),
    promotion: toCTN(totalStockPromotionPCS),
    change: toCTN(totalStockChangePCS),
    changePending: toCTN(totalStockChangePendingPCS),
    adjust: toCTN(totalStockAdjustPCS),
    give: toCTN(totalStockGivePCS),
    in: toCTN(inPCS),
    stockWithIn: toCTN(stockWithInPCS),
    out: toCTN(outPCS),
    balance: toCTN(balancePCS)
  }

  return [resultPCS, resultCTN]
}

const getOrders = async (areaList, res, channel, type) => {
  const { Order } = getModelsByChannel(channel, null, orderModel)

  const match = {
    status: { $nin: ['canceled'] },
    type: { $in: ['sale'] },
    'store.area': { $ne: 'IT211' }
  }

  if (type === 'area') {
    if (Array.isArray(areaList) && areaList.length > 0) {
      match['store.area'] = { $in: areaList }
    }
  } else if (type === 'zone') {
    if (Array.isArray(areaList) && areaList.length > 0) {
      match['store.zone'] = { $in: areaList }
    }
  }

  const orders = await Order.aggregate([
    { $match: match },
    {
      $addFields: {
        zone: { $substr: ['$store.area', 0, 2] } // ✅ เอา 2 ตัวแรกจาก store.area
      }
    },
    { $sort: { createdAt: 1, orderId: 1 } }
  ])

  return orders
}

const getChange = async (areaList, res, channel, type) => {
  const { Order } = getModelsByChannel(channel, null, orderModel)
  const match = {
    status: { $nin: ['canceled', 'reject'] },
    type: { $in: ['change'] },
    'store.area': { $ne: 'IT211' }
  }
  if (type === 'area') {
    if (Array.isArray(areaList) && areaList.length > 0) {
      match['store.area'] = { $in: areaList }
    }
  } else if (type === 'zone') {
    if (Array.isArray(areaList) && areaList.length > 0) {
      match['store.zone'] = { $in: areaList }
    }
  }

  const orders = await Order.aggregate([
    { $match: match },
    { $sort: { createdAt: 1, orderId: 1 } }
  ])

  return orders
}

const getRefund = async (areaList, res, channel, type) => {
  const { Refund } = getModelsByChannel(channel, null, refundModel)
  const match = {
    status: { $nin: ['canceled', 'reject'] },
    type: { $in: ['refund'] },
    'store.area': { $ne: 'IT211' }
  }

  if (type === 'area') {
    if (Array.isArray(areaList) && areaList.length > 0) {
      match['store.area'] = { $in: areaList }
    }
  } else if (type === 'zone') {
    if (Array.isArray(areaList) && areaList.length > 0) {
      match['store.zone'] = { $in: areaList }
    }
  }

  const orders = await Refund.aggregate([
    { $match: match },
    { $sort: { createdAt: 1, orderId: 1 } }
  ])

  return orders
}

const distributionSendEmail = async (orderDetail, res, channel) => {
  const { User } = getModelsByChannel(channel, res, userModel)
  const { Distribution, WereHouse, Withdraw } = getModelsByChannel(
    channel,
    res,
    distributionModel
  )

  const withdrawType = await Option.findOne({ module: 'withdraw' })
  const withdrawTypeTh = withdrawType.list.find(
    item => item.value === orderDetail.withdrawType
  ).name
  const userData = await User.findOne({
    role: 'sale',
    area: orderDetail.area
  })
  const email = await Withdraw.findOne({
    ROUTE: orderDetail.shippingRoute,
    Des_No: orderDetail.shippingId
  }).select('Dc_Email Des_Name')
  const wereHouseName = await WereHouse.findOne({
    wh_code: orderDetail.fromWarehouse
  }).select('wh_name')

  sendEmail({
    to: email.Dc_Email,
    // cc: [process.env.BELL_MAIL, process.env.BANK_MAIL],
    cc: process.env.IT_MAIL,
    subject: `${orderDetail.orderId} 12App cash`,
    html: `
          <h1>แจ้งการส่งใบขอเบิกผ่านทางอีเมล</h1>
          <p>
            <strong>ประเภทการเบิก:</strong> ${withdrawTypeTh}<br> 
            <strong>เลขที่ใบเบิก:</strong> ${orderDetail.orderId}<br>
            <strong>ประเภทการจัดส่ง:</strong> ${orderDetail.orderTypeName}<br>
            <strong>จัดส่ง:</strong> ${orderDetail.fromWarehouse}${
      '-' + wereHouseName?.wh_name || ''
    }<br>
            <strong>สถานที่จัดส่ง:</strong> ${orderDetail.toWarehouse}-${
      orderDetail.shippingName
    }<br>
            <strong>วันที่จัดส่ง:</strong> ${orderDetail.sendDate}<br>
            <strong>เขต:</strong> ${orderDetail.area}<br>
            <strong>ชื่อ:</strong> ${userData.firstName} ${userData.surName}<br>
            <strong>เบอร์โทรศัพท์เซลล์:</strong> ${userData.tel}<br>
            <strong>หมายเหตุ:</strong> ${orderDetail.remark}
          </p>
        `
  })
}

function yyyymmddToDdMmYyyy (dateString) {
  // สมมติ dateString คือ '20250804'
  const year = dateString.slice(0, 4)
  const month = dateString.slice(4, 6)
  const day = dateString.slice(6, 8)
  return `${day}${month}${year}`
}

const dataPowerBi = async (
  channel,
  conoBiList,
  status,
  startDate,
  endDate,
  currentDate
) => {
  const { Order } = getModelsByChannel(channel, null, orderModel)
  const { Product } = getModelsByChannel(channel, null, productModel)
  const { Refund } = getModelsByChannel(channel, null, refundModel)
  const { Store } = getModelsByChannel(channel, null, storeModel)

  let statusArray = (status || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  if (statusArray.length === 0) {
    statusArray = ['pending'] // default
  }

  // console.log(statusArray)

  const startTH = new Date(
    `${startDate.slice(0, 4)}-${startDate.slice(4, 6)}-${startDate.slice(
      6,
      8
    )}T00:00:00+07:00`
  )
  const endTH = new Date(
    `${endDate.slice(0, 4)}-${endDate.slice(4, 6)}-${endDate.slice(
      6,
      8
    )}T23:59:59.999+07:00`
  )

  const modelOrder = await Order.aggregate([
    {
      $match: {
        createdAt: {
          $gte: startTH,
          $lte: endTH
        }
      }
    },
    {
      $match: {
        status: { $nin: ['canceled'] },
        status: { $in: statusArray },
        type: { $in: ['sale'] },
        'store.area': { $ne: 'IT211' }
        // 'store.area': 'NE211'
      }
    },
    {
      $addFields: {
        createdAtThai: {
          $dateAdd: {
            startDate: '$createdAt',
            unit: 'hour',
            amount: 7
          }
        }
      }
    },
    {
      $sort: { createdAt: 1, orderId: 1 } // เรียงจากน้อยไปมาก (ASC) ถ้าอยากให้ใหม่สุดอยู่บน ใช้ -1
    }
  ])

  const modelChange = await Order.aggregate([
    {
      $match: {
        'store.area': { $ne: 'IT211' },
        // 'store.area': 'NE211',
        status: { $in: statusArray },
        status: { $nin: ['reject', 'canceled', 'pending'] },
        type: { $in: ['change'] }
      }
    },
    {
      $addFields: {
        createdAtThai: {
          $dateAdd: {
            startDate: '$createdAt',
            unit: 'hour',
            amount: 7
          }
        }
      }
    },
    {
      $match: {
        createdAt: {
          $gte: startTH,
          $lte: endTH
        }
      }
    },
    {
      $sort: { createdAt: 1, orderId: 1 } // เรียงจากน้อยไปมาก (ASC) ถ้าอยากให้ใหม่สุดอยู่บน ใช้ -1
    }
  ])

  const modelRefund = await Refund.aggregate([
    {
      $match: {
        status: { $in: statusArray },
        status: { $nin: ['canceled', 'reject', 'pending'] },
        'store.area': { $ne: 'IT211' }
        // 'store.area': 'NE211'
      }
    },
    {
      $addFields: {
        createdAtThai: {
          $dateAdd: {
            startDate: '$createdAt',
            unit: 'hour',
            amount: 7
          }
        }
      }
    },
    {
      $match: {
        createdAt: {
          $gte: startTH,
          $lte: endTH
        }
      }
    },
    {
      $sort: { createdAt: 1, orderId: 1 } // เรียงจากน้อยไปมาก (ASC) ถ้าอยากให้ใหม่สุดอยู่บน ใช้ -1
    }
  ])

  const productDetails = await Product.find()

  const storeIdList = [
    ...new Set(
      [...modelChange, ...modelOrder]
        .flatMap(it => it.store?.storeId ?? [])
        .filter(Boolean) // ตัด null/undefined/'' ออก
    )
  ]

  const storeData = await Store.find({ storeId: { $in: storeIdList } })

  function formatDateToThaiYYYYMMDD (date) {
    const d = new Date(date)
    d.setHours(d.getHours() + 7) // บวก 7 ชั่วโมงให้เป็นเวลาไทย (UTC+7)

    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')

    return `${yyyy}${mm}${dd}`
  }

  const tranFromOrder = [...modelOrder, ...modelChange, ...modelRefund].flatMap(
    order => {
      const store = storeData.find(i => i.storeId === order.store.storeId)
      let counterOrder = 0

      // console.log(order.orderId)
      // ใช้งาน
      const RLDT = formatDateToThaiYYYYMMDD(order.createdAt)

      const createdAtDate = `${RLDT.slice(0, 4)}-${RLDT.slice(
        4,
        6
      )}-${RLDT.slice(6, 8)}`
      const createdAtDatetime = new Date(
        new Date(order.createdAt).getTime() + 7 * 3600 * 1000
      )
        .toISOString()
        .replace('Z', '') // "2025-08-25T14:41:30.582"

      const hhmmss = createdAtDatetime.slice(11, 19).replace(/:/g, '')

      const listProduct = order.listProduct.map(product => {
        return {
          proCode: '',
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
          subtotal: product.subtotal,
          discount: product.discount,
          netTotal: product.netTotal
        }
      })

      const listPromotion =
        order.listPromotions?.flatMap(
          promo =>
            promo.listProduct?.map(product => ({
              proCode: promo.proCode,
              id: product.id,
              name: product.name,
              group: product.group,
              brand: product.brand,
              size: product.size,
              flavour: product.flavour,
              qty: product.qty,
              unit: product.unit,
              unitName: product.unitName,
              qtyPcs: product.qtyPcs
            })) || []
        ) || []

      const productIDS = [...listProduct, ...listPromotion].flat()
      // console.log("conoBiList",conoBiList)
      // console.log("createdAtDate", createdAtDate)
      return productIDS
        .filter(p => typeof p?.id === 'string' && p.id.trim() !== '')
        .map(product => {
          const existPowerBi = conoBiList.find(item => item === order.orderId)

          if (existPowerBi) return null

          counterOrder++

          const productDetail = productDetails.find(i => product.id === i.id)
          const factorCtn =
            productDetail?.listUnit?.find?.(i => i.unit === 'CTN')?.factor ?? 1
          const factor =
            productDetail?.listUnit?.find?.(i => i.unit === product?.unit)
              ?.factor ?? 0
          const MONTHS_EN = [
            'January',
            'February',
            'March',
            'April',
            'May',
            'June',
            'July',
            'August',
            'September',
            'October',
            'November',
            'December'
          ]
          const monthName = MONTHS_EN[Number(RLDT.slice(4, 6)) - 1]

          let SALE_FOC = ''

          let orderType = ''
          if (order.type === 'refund') {
            orderType = 'A34'
            SALE_FOC = 'CN'
          } else if (order.type === 'sale') {
            orderType = 'A31'
            if (product.proCode) {
              SALE_FOC = 'FOC'
            } else {
              SALE_FOC = 'SALE'
            }
          } else if (order.type === 'change') {
            orderType = 'B31'
            SALE_FOC = 'CN'
          }

          const QTY_USC = factor * product.qty

          return {
            INVO: order.orderId,
            ORDER_DATE: createdAtDate,
            OLINE_DATE: createdAtDate,
            OOLINE_TIME: createdAtDatetime,
            COMP_NO: '410',
            CONO: order?.orderNo || '',
            RUNNO_BILL: `${counterOrder}`,
            STATUS_BILL: order?.lowStatus || '11',
            WHCODE: order.sale.warehouse,
            ITEM_CODE: product.id,
            ITEM_NAME: product.name,
            ITEM_DES: product.name,
            QTY_USC: QTY_USC,
            QTY_PACK: product.qty,
            UNIT_SHIP: product.unit,
            PACK_SIZE: factor,
            AMOUNT_DIS: product?.price || 0,
            AMOUNT_FULL: product?.price || 0,
            SUM_AMOUNT: product?.subtotal || 0,
            SUM_AMOUNT2: product?.subtotal || 0,
            CUS_CODE: order.store.storeId,
            RUNNING_NO: '',
            DUO_CODE: order.store.storeId,
            CREATE_DATE: RLDT,
            CREATE_TIME: hhmmss,
            CO_TYPE: product.proCode,
            DARIVERY_DATE: RLDT,
            IMPORT_TYPE: 'MVXSECOFR',
            CHANNEL: '103',
            SALE_FOC: SALE_FOC,
            CO_MONTH: monthName,
            CO_YEAR: RLDT.slice(0, 4),
            MT_ID: '',
            SALE_CODE: order.sale.saleCode,
            OOTYPE: orderType,
            GROUP_TYPE: productDetail.groupCodeM3,
            BRAND: productDetail.brandCode,
            FLAVOUR: product.flavourCode,
            CUS_NAME: order.store.name,
            CUS_DESCRIPTION: order.store.name,
            PROVINCE: store.province,
            DISTRICT: store.district,
            SHOP_TYPE: store.typeName,
            CUS_AREA: store.area,
            CUS_ZONE: store.zone,
            PROVINCE_ZONE: store.zone,
            PROVINCE_CODE: store.postCode,
            QTY_CTN: factorCtn,
            QTY: module.exports.to2(QTY_USC / factorCtn),
            REMAIN_QTY: 0,
            SALE_PLAYER: order.sale.salePayer,
            SYS_STATUS: 'Y',
            MODIFY_DATE: currentDate,
            FOC_AMOUNT: 0,
            ROUTE_ID: order.shipping?.shippingId || '',
            ROUTE_NAME: '',
            SHIPPING_PROVINCE: order.shipping?.postCode || '',
            SHIPPING_NAME: order.shipping?.province || '',
            DUO_NAME: order.store.name,
            CUS_TEAM: `${order.store.zone}${store.area.slice(3, 4)}`
          }
        })
        .filter(Boolean)
    }
  )

  const allTransactions = [...tranFromOrder]
  return allTransactions
}

const dataWithdraw = async (channel, status, startDate, endDate) => {
  const { Distribution } = getModelsByChannel(channel, null, DistributionModel)
  const { Product } = getModelsByChannel(channel, null, productModel)

  let statusArray = (status || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  if (statusArray.length === 0) {
    statusArray = ['confirm', 'onprocess', 'approved', 'canceled'] // default
  }

  // console.log(statusArray)

  const startTH = new Date(
    `${startDate.slice(0, 4)}-${startDate.slice(4, 6)}-${startDate.slice(
      6,
      8
    )}T00:00:00+07:00`
  )
  const endTH = new Date(
    `${endDate.slice(0, 4)}-${endDate.slice(4, 6)}-${endDate.slice(
      6,
      8
    )}T23:59:59.999+07:00`
  )

  const timestamp = startTH.getTime()

  const modelWithdraw = await Distribution.aggregate([
    {
      $match: {
        createdAt: {
          $gte: startTH,
          $lte: endTH
        }
      }
    },
    {
      $match: {
        // status: { $nin: ['canceled'] },
        status: { $in: statusArray },
        type: { $in: ['withdraw'] },
        area: { $ne: 'IT211' },
        withdrawType: { $ne: 'credit' }
      }
    },
    {
      $addFields: {
        createdAtThai: {
          $dateAdd: {
            startDate: '$createdAt',
            unit: 'hour',
            amount: 7
          }
        }
      }
    },
    {
      $sort: { createdAt: 1, orderId: 1 } // เรียงจากน้อยไปมาก (ASC) ถ้าอยากให้ใหม่สุดอยู่บน ใช้ -1
    }
  ])

  const productDetails = await Product.find()

  function formatDateToThaiYYYYMMDD (date) {
    const d = new Date(date)
    d.setHours(d.getHours() + 7) // บวก 7 ชั่วโมงให้เป็นเวลาไทย (UTC+7)

    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')

    return `${yyyy}${mm}${dd}`
  }

  const tranFromOrder = [...modelWithdraw].flatMap(order => {
    let counterOrder = 0
    const RLDT = formatDateToThaiYYYYMMDD(order.createdAt)

    const createdAtDate = `${RLDT.slice(0, 4)}-${RLDT.slice(4, 6)}-${RLDT.slice(
      6,
      8
    )}`
    const createdAtDatetime = new Date(
      new Date(order.createdAt).getTime() + 7 * 3600 * 1000
    )
      .toISOString()
      .replace('Z', '') // "2025-08-25T14:41:30.582"

    const hhmmss = createdAtDatetime.slice(11, 19).replace(/:/g, '')

    const listProduct = order.listProduct.map(product => {
      return {
        proCode: '',
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
        subtotal: product.subtotal,
        discount: product.discount,
        receiveQty: product.receiveQty,
        weightGross: product.weightGross,
        qtyPcs: product.qtyPcs,
        netTotal: product.netTotal,
        isNPD: product.isNPD
      }
    })

    const productIDS = [...listProduct].flat()
    return productIDS
      .filter(p => typeof p?.id === 'string' && p.id.trim() !== '')
      .map(product => {
        // const existPowerBi = conoBiList.find(item => item === order.orderId)

        // if (existPowerBi) return null

        counterOrder++

        const productDetail = productDetails.find(i => product.id === i.id)

        const factorCtn =
          productDetail?.listUnit?.find?.(i => i.unit === 'CTN')?.factor ?? 1

        const factorPCS =
          productDetail?.listUnit?.find?.(i => i.unit === 'PCS')?.factor ?? 1

        let WD_STATUS = ''
        switch (order.statusTH) {
          case 'อนุมัติ':
            WD_STATUS = '22'
            break
          case 'ยืนยันรับของ':
            WD_STATUS = '99'
            break
          case 'กรุณากดรับสินค้า':
            WD_STATUS = '99'
            break
          case 'รอศูนย์ดำเนินการ':
            WD_STATUS = '22'
            break
          default:
            WD_STATUS = '99'
            break
        }

        return {
          COMP_NO: '410',
          WD_DATE: createdAtDate,
          WD_TIME: hhmmss,
          RECEIVE_TYPE: order.orderType,
          WD_NO: order.orderId,
          WD_STATUS: WD_STATUS,
          TO_WH: order.toWarehouse,
          FROM_WH: order.fromWarehouse,
          TOTAL_WEIGHT: order.receivetotalWeightGross.toFixed(2),
          WD_LIST: order.listProduct.length,
          ITEM_CODE: product.id,
          ITEM_NAME: product.name,
          ITEM_WEIGHT: product.weightGross,
          PCS_QTY: product.qtyPcs,
          SHIP_WD: product.unit,
          RUNNING: timestamp,
          ITEM_GROUP: productDetail.groupCodeM3,
          ITEM_PRICE: product.price,
          MODIFY_DATE: createdAtDatetime,
          PCS_SHIP: factorCtn,
          PICK_QTY: product.qtyPcs,
          WD_REMARK: '',
          PICK_REMARK: order.remark,
          WD_QTY: product.qty,
          SHIP_QTY: product.receiveQty,
          AREA: order.area,
          TOTAL_PRICE: order.total,
          STATUS: order.status,
          STATUS_TH: order.statusTH,
          IS_NEWTRIP: order.newTrip?.toUpperCase?.() || '',
          IS_NPD: product.isNPD ? 'TRUE' : 'FALSE',
          REMARK_WAREHOUSE: order.remarkWarehouse?.remark  || ''
        }
      })
      .filter(Boolean)
  })

  const allTransactions = [...tranFromOrder]
  return allTransactions
}

exports.calculateStockSummary = calculateStockSummary
exports.getOrders = getOrders
exports.getChange = getChange
exports.getRefund = getRefund
exports.dataPowerBi = dataPowerBi
exports.dataWithdraw = dataWithdraw
// module.exports = { calculateStockSummary };
