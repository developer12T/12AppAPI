const { OOTYPE, NumberSeries } = require('../models/cash/master')
const { getModelsByChannel } = require('../middleware/channel')
const cartModel = require('../models/cash/cart')
const productModel = require('../models/cash/product')
const stockModel = require('../models/cash/stock')
const nodemailer = require('nodemailer')
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

async function checkProductInStock(Stock, area, period, id) {
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


  console.log(id,unit,qty,area,period)
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
  async function checkBalanceEnough(area, period, id, pcsNeed) {
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

    console.log(id,factorPcsQty)

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
  }
  else if (type === 'reduceWithdraw') {
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
function calculateStockSummary(productDetail, listUnitStock) {
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


function calculateStockSummary(productDetail, listUnitStock) {
  // helper เอา factor ของหน่วยจาก productDetail.listUnit
  const getFactor = (unit) => {
    const unitObj = productDetail.listUnit.find(item => item.unit === unit);
    return unitObj ? Number(unitObj.factor) || 0 : 0;
  };

  // รวมเป็น PCS ของแต่ละฟิลด์ ด้วย factor ของหน่วยนั้น ๆ
  const sumPCS = (field) =>
    listUnitStock.reduce((sum, u) => {
      const factor = getFactor(u.unit);
      const qty = Number(u?.[field]) || 0;
      return sum + factor * qty;
    }, 0);

  // รวมค่าเป็น PCS
  const totalStockPCS = sumPCS('stock');
  const totalStockWithdrawPCS = sumPCS('withdraw');
  const totalStockGoodPCS = sumPCS('good');
  const totalStockDamagedPCS = sumPCS('damaged');
  const totalStockSalePCS = sumPCS('sale');
  const totalStockPromotionPCS = sumPCS('promotion');
  const totalStockChangePCS = sumPCS('change');
  const totalStockAdjustPCS = sumPCS('adjust');
  const totalStockGivePCS = sumPCS('give');
  const totalStockCartPCS = sumPCS('cart');
  const totalStockChangePendingPCS = sumPCS('changePending');



  const inPCS = totalStockWithdrawPCS + totalStockGoodPCS;
  const outPCS = totalStockSalePCS + totalStockPromotionPCS + totalStockChangePCS + totalStockAdjustPCS + totalStockGivePCS;
  const stockWithInPCS = totalStockPCS + inPCS;
  const balancePCS = stockWithInPCS - outPCS - totalStockCartPCS - totalStockChangePendingPCS;

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
    changePending : totalStockChangePendingPCS,
    adjust: totalStockAdjustPCS,
    give: totalStockGivePCS,
    in: inPCS,
    stockWithIn: stockWithInPCS,
    out: outPCS,
    balance: balancePCS,
  };

  // แปลงเป็น CTN โดยปัดลง
  const factorCTN = getFactor('CTN');
  const toCTN = (pcs) =>
    factorCTN > 0 ? Math.floor(pcs / factorCTN) : 0;

  const resultCTN = {
    unit: 'CTN',
    stock: toCTN(totalStockPCS),
    withdraw: toCTN(totalStockWithdrawPCS),
    good: toCTN(totalStockGoodPCS),
    damaged: toCTN(totalStockDamagedPCS),
    sale: toCTN(totalStockSalePCS),
    cart:toCTN(totalStockCartPCS),
    promotion: toCTN(totalStockPromotionPCS),
    change: toCTN(totalStockChangePCS),
    changePending : toCTN(totalStockChangePendingPCS),
    adjust: toCTN(totalStockAdjustPCS),
    give: toCTN(totalStockGivePCS),
    in: toCTN(inPCS),
    stockWithIn: toCTN(stockWithInPCS),
    out: toCTN(outPCS),
    balance: toCTN(balancePCS),
  };

  return [resultPCS, resultCTN];
}

exports.calculateStockSummary = calculateStockSummary;

// module.exports = { calculateStockSummary };