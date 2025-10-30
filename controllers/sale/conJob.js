const cron = require('node-cron')
// const { erpApiCheckOrder,erpApiCheckDisributionM3 } = require('../../controllers/sale/orderController')
const { OrderToExcelConJob } = require('../../controllers/sale/orderController')
const { period, rangeDate } = require('../../utilities/datetime')
const {
  to2,
  updateStockMongo,
  calculateStockSummary
} = require('../../middleware/order')

const {
  Warehouse,
  Locate,
  Balance,
  DisributionM3,
  OOHEAD,
  OOLINE
} = require('../../models/cash/master')
const { WithdrawCash } = require('../../models/cash/powerBi')
const fs = require('fs')
const path = require('path')
const { sequelize, DataTypes } = require('../../config/m3db')
const { Op, fn, literal } = require('sequelize')
const { getSocket } = require('../../socket')

const userModel = require('../../models/cash/user')
const distributionModel = require('../../models/cash/distribution')
const productModel = require('../../models/cash/product')
const stockModel = require('../../models/cash/stock')
const giveModel = require('../../models/cash/give')
const orderModel = require('../../models/cash/sale')
const cartModel = require('../../models/cash/cart')
const refundModel = require('../../models/cash/refund')
const adjustStockModel = require('../../models/cash/stock')
const storeModel = require('../../models/cash/store')

const {
  dataPowerBiQuery,
  dataM3Query,
  dataPowerBiQueryDelete,
  dataPowerBiQueryInsert,
  dataWithdrawInsert
} = require('../../controllers/queryFromM3/querySctipt')
const {
  formatDateTimeToThai,
  dataPowerBi,
  dataWithdraw
} = require('../../middleware/order')
const { restock } = require('../../middleware/stock')

const { getModelsByChannel } = require('../../middleware/channel')
const { create } = require('lodash')

const pathLog = '/controllers/sale/conjobLog/'

async function erpApiCheckOrderJob (channel = 'cash') {
  const logFile = path.join(
    process.cwd(),
    `${pathLog}startCronJobErpApiCheck.txt`
  )
  const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
  try {
    const { Order } = getModelsByChannel(channel, null, orderModel)
    const { Refund } = getModelsByChannel(channel, null, refundModel)
    const { Distribution } = getModelsByChannel(
      channel,
      null,
      distributionModel
    )
    // 2. Get pending orderIds ใน MongoDB
    const inMongo = await Order.find({ status: 'pending' }).select('orderId')
    const inMongoRefund = await Refund.find({ status: 'approved' }).select(
      'orderId'
    )
    // const inMongoRefund = await Refund.find({ status: 'pending' }).select(
    //   'orderId'
    // )

    const orderIdsInMongo = inMongo.map(item => item.orderId.toString())
    const refundIdsInMongo = inMongoRefund.map(item => item.orderId.toString())
    // const refundIdsInMongo = inMongoRefund.map(item => item.orderId.toString())

    // 2) กันลิมิต MSSQL ด้วยการ chunk (เช่น ชุดละ 1000)
    const chunk = (arr, size) => {
      const out = []
      for (let i = 0; i < arr.length; i += size)
        out.push(arr.slice(i, i + size))
      return out
    }
    const idChunks = chunk(orderIdsInMongo, 1000)
    const idChunksRefund = chunk(refundIdsInMongo, 1000)

    // const matchedIdsRefund = inMongoRefund.filter(id => saleIds.includes(id))
    let sales = []
    let refund = []

    for (const ids of idChunks) {
      // 1) ดึงยอดจากตาราง Sale (SQL)
      const rows = await OOHEAD.findAll({
        attributes: [
          'OACUOR',
          [sequelize.fn('MAX', sequelize.col('OAORNO')), 'OAORNO'],
          [sequelize.fn('MAX', sequelize.col('OAORST')), 'OAORST'],
          [sequelize.fn('MAX', sequelize.col('OAORSL')), 'OAORSL']
        ],
        where: { OACUOR: { [Op.in]: ids } }, // ✅ เฉพาะที่มีใน Mongo
        // where: { OACUOR: '6808133120225' }, // หรือ { OACUOR: { [Op.in]: ids } }
        group: ['OACUOR'],
        raw: true
      })
      sales = sales.concat(rows)
    }

    for (const ids of idChunksRefund) {
      // 1) ดึงยอดจากตาราง Sale (SQL)
      const rows = await OOHEAD.findAll({
        attributes: [
          'OACUOR',
          [sequelize.fn('MAX', sequelize.col('OAORNO')), 'OAORNO'],
          [sequelize.fn('MAX', sequelize.col('OAORST')), 'OAORST'],
          [sequelize.fn('MAX', sequelize.col('OAORSL')), 'OAORSL']
        ],
        where: { OACUOR: { [Op.in]: ids } }, // ✅ เฉพาะที่มีใน Mongo
        // where: { OACUOR: '6808133120225' }, // หรือ { OACUOR: { [Op.in]: ids } }
        group: ['OACUOR'],
        raw: true
      })
      refund = refund.concat(rows)
    }

    // 2) ทำ map เพื่ออ้างอิงข้อมูลรายรายการ
    const saleById = new Map(
      sales.map(r => [
        String(r.OACUOR),
        {
          lowStatus: String(r.OAORSL),
          heightStatus: String(r.OAORST),
          orderNo: String(r.OAORNO)
        }
      ])
    )

    const refundById = new Map(
      refund.map(r => [
        String(r.OACUOR),
        {
          lowStatus: String(r.OAORSL),
          heightStatus: String(r.OAORST),
          orderNo: String(r.OAORNO)
        }
      ])
    )
    const saleIdSet = new Set(sales.map(s => String(s.OACUOR)))
    const refundIdSet = new Set(refund.map(s => String(s.OACUOR)))
    // 3. filter ให้เหลือเฉพาะที่อยู่ทั้งสองฝั่ง
    const matchedIds = orderIdsInMongo.filter(id => saleIdSet.has(id))
    const refundMatchedIds = refundIdsInMongo.filter(id => refundIdSet.has(id))

    const oaornoList = sales.map(r => r.OACUOR).filter(Boolean)
    const refundList = refund.map(r => r.OACUOR).filter(Boolean)

    const lineAgg = await OOLINE.findAll({
      attributes: ['OBCUOR', [fn('COUNT', literal('*')), 'lineCount']],
      where: { OBCUOR: { [Op.in]: oaornoList } },
      group: ['OBCUOR'],
      raw: true
    })

    const refundLineAgg = await OOLINE.findAll({
      attributes: ['OBCUOR', [fn('COUNT', literal('*')), 'lineCount']],
      where: { OBCUOR: { [Op.in]: refundList } },
      group: ['OBCUOR'],
      raw: true
    })

    console.log(lineAgg)

    const lineCountByOBORNO = new Map(
      lineAgg.map(r => [String(r.OBCUOR), Number(r.lineCount) || 0])
    )

    const lineCountByOBORNORefund = new Map(
      refundLineAgg.map(r => [String(r.OBCUOR), Number(r.lineCount) || 0])
    )

    console.log(lineCountByOBORNO)

    // 4) แปลงเป็น OACUOR -> lineCount (อาศัย OAORNO ของ sales)
    const lineCountByOACUOR = new Map(
      sales.map(r => [
        String(r.OACUOR),
        lineCountByOBORNO.get(String(r.OACUOR)) ?? 0
      ])
    )

    const lineCountByOACUORRefund = new Map(
      sales.map(r => [
        String(r.OACUOR),
        lineCountByOBORNORefund.get(String(r.OACUOR)) ?? 0
      ])
    )

    console.log(lineCountByOACUOR)

    // 4. อัปเดตทุกตัวที่ match (วนทีละตัว)
    let updatedCount = 0
    let updatedCountReufund = 0

    if (matchedIds.length) {
      const ops = matchedIds.map(orderId => ({
        updateOne: {
          filter: { orderId },
          update: {
            $set: {
              status: 'completed',
              statusTH: 'สำเร็จ',
              updatedAt: new Date(),
              // เก็บ OACUOR ไว้ในเอกสารด้วย (ถ้าต้องการ)
              // oacuor: orderId,
              // ใส่ข้อมูลประกอบจากฝั่ง Sale (เช่นจำนวนแถวที่เจอ)
              lowStatus: saleById.get(orderId)?.lowStatus ?? '',
              heightStatus: saleById.get(orderId)?.heightStatus ?? '',
              orderNo: saleById.get(orderId)?.orderNo ?? '',

              // ✅ จำนวนบรรทัดจาก OOLINE
              lineM3: lineCountByOACUOR.get(orderId) ?? 0
            }
          }
        }
      }))

      const res = await Order.bulkWrite(ops, { ordered: false })
      if (res.modifiedCount > 0) updatedCount++
      console.log('Order updated:', res.modifiedCount)
    }

    if (refundMatchedIds.length) {
      const ops = refundMatchedIds.map(orderId => ({
        updateOne: {
          filter: { orderId },
          update: {
            $set: {
              status: 'completed',
              statusTH: 'สำเร็จ',
              updatedAt: new Date(),
              // เก็บ OACUOR ไว้ในเอกสารด้วย (ถ้าต้องการ)
              // oacuor: orderId,
              // ใส่ข้อมูลประกอบจากฝั่ง Sale (เช่นจำนวนแถวที่เจอ)
              lowStatus: refundById.get(orderId)?.lowStatus ?? '',
              heightStatus: refundById.get(orderId)?.heightStatus ?? '',
              orderNo: refundById.get(orderId)?.orderNo ?? '',

              // ✅ จำนวนบรรทัดจาก OOLINE
              lineM3: lineCountByOACUORRefund.get(orderId) ?? 0
            }
          }
        }
      }))
      const res = await Refund.bulkWrite(ops, { ordered: false })
      if (res.modifiedCount > 0) updatedCountReufund++
      console.log('Refund updated:', res.modifiedCount)
    }
    const summaryCount = updatedCount + updatedCountReufund

    const io = getSocket()
    io.emit('order/statusOrderUpdated', {
      summaryCount,
      updatedAt: new Date()
    })

    console.log(`Total updated Order: ${summaryCount}`)
    fs.appendFileSync(logFile, `[${now}] ✅ Job completed successfully\n`)
    return summaryCount
  } catch (error) {
    console.error('❌ Error in erpApiCheckOrderJob:', error)
    fs.appendFileSync(logFile, `[${now}] ❌ Job failed: ${error.message}\n`)
    return { error: true, message: error.message }
  }
}

async function erpApiCheckDisributionM3Job (channel = 'cash') {
  try {
    const { Distribution } = getModelsByChannel(channel, null, disributionModel)

    // 1. Get order numbers (MGTRNR) ที่มีใน DisributionM3
    const modelSale = await DisributionM3.findAll({
      attributes: [
        'MGTRNR',
        [sequelize.fn('COUNT', sequelize.col('MGTRNR')), 'count']
      ],
      group: ['MGTRNR']
    })
    const distributionIds = modelSale.map(row => row.get('MGTRNR').toString())

    // 2. Get pending orderIds ใน MongoDB
    const inMongo = await Distribution.find({ status: 'pending' }).select(
      'orderId'
    )
    const orderIdsInMongo = inMongo.map(item => item.orderId.toString())

    // 3. filter ให้เหลือเฉพาะที่อยู่ทั้งสองฝั่ง
    const matchedIds = orderIdsInMongo.filter(id =>
      distributionIds.includes(id)
    )

    if (!matchedIds.length) {
      console.log('No new order Distribution found in the M3 system')
      return { updated: false, updatedCount: 0 }
    }

    // 4. อัปเดตทุกตัวที่ match (วนทีละตัว)
    let updatedCount = 0
    for (const orderId of matchedIds) {
      try {
        const result = await Distribution.updateOne(
          { orderId },
          {
            $set: {
              status: 'completed',
              statusTH: 'สำเร็จ',
              updatedAt: new Date()
            }
          }
        )
        if (result.modifiedCount > 0) updatedCount++
      } catch (err) {
        console.error(`Error update orderId: ${orderId}`, err)
      }
    }

    // 5. Broadcast event
    // const io = getSocket();
    // const events = [
    //   'sale_getSummarybyArea',
    //   'sale_getSummarybyMonth',
    //   'sale_getSummarybyRoute',
    //   'sale_getSummaryItem',
    //   'sale_getSummarybyGroup',
    //   'sale_getRouteCheckinAll',
    //   'sale_getTimelineCheckin',
    //   'sale_routeTimeline'
    // ];
    // events.forEach(event => {
    //   io.emit(event, {
    //     status: 200,
    //     message: 'New Update Data'
    //   });
    // });
    const io = getSocket()
    io.emit('order/statusWithdrawUpdated', {
      updatedCount,
      updatedAt: new Date()
    })

    console.log(`Total updated Distribution: ${updatedCount}`)
    return updatedCount
  } catch (error) {
    console.error('❌ Error in erpApiCheckDisributionM3Job:', error)
    return { error: true, message: error.message }
  }
}

async function DeleteCartDaily (channel = 'cash') {
  // เปิด session สำหรับ transaction
  // const session = await mongoose.startSession();
  // session.startTransaction();

  try {
    const { Cart } = getModelsByChannel(channel, null, cartModel)
    const { Stock } = getModelsByChannel(channel, null, stockModel)
    const { Product } = getModelsByChannel(channel, null, productModel)

    // ดึงข้อมูล cart ทั้งหมด (เช่นเดิม)
    await Cart.deleteMany({ type: 'withdraw' })

    const data = await Cart.find({})
    // .session(session);
    // console.log(data)
    // ดึงข้อมูล listProduct และ listPromotion
    const listProduct = data.flatMap(sub =>
      sub.listProduct.map(item => ({
        storeId: sub.storeId,
        area: sub.area,
        id: item.id,
        unit: item.unit,
        qty: item.qty
      }))
    )

    const listPromotion = data.flatMap(sub =>
      sub.listPromotion.flatMap(item =>
        item.listProduct.map(y => ({
          storeId: sub.storeId,
          area: sub.area,
          id: y.id,
          unit: y.unit,
          qty: y.qty
        }))
      )
    )

    for (const item of [...listProduct, ...listPromotion]) {
      // console.log(item)
      // console.log(item)
      // await updateStockMongo(item, item.area, period(), 'deleteCart', channel)
      const updateResult = await updateStockMongo(
        item,
        item.area,
        period(),
        'deleteCart',
        channel
      )
      if (updateResult) return
      // ดึง factor สำหรับแต่ละ unit
      // console.log("item ",item.storeId,item.area)
      // const factorPcsResult = await Product.aggregate([
      //   { $match: { id: item.id } },
      //   {
      //     $project: {
      //       id: 1,
      //       listUnit: {
      //         $filter: {
      //           input: "$listUnit",
      //           as: "unitItem",
      //           cond: { $eq: ["$$unitItem.unit", item.unit] }
      //         }
      //       }
      //     }
      //   }
      // ])
      // // .session(session);

      // const factorCtnResult = await Product.aggregate([
      //   { $match: { id: item.id } },
      //   {
      //     $project: {
      //       id: 1,
      //       listUnit: {
      //         $filter: {
      //           input: "$listUnit",
      //           as: "unitItem",
      //           cond: { $eq: ["$$unitItem.unit", "CTN"] }
      //         }
      //       }
      //     }
      //   }
      // ])
      // // .session(session);

      // // ตรวจสอบว่ามีข้อมูล unit
      // if (!factorCtnResult.length || !factorCtnResult[0].listUnit.length ||
      //     !factorPcsResult.length || !factorPcsResult[0].listUnit.length) {
      //   // throw new Error(`unit factor not found for product ${item.id}`);
      //   // console.log(item.id,"item.unit :",item.unit, item.area )
      // }

      // const factorCtn = factorCtnResult[0].listUnit[0].factor;
      // const factorPcs = factorPcsResult[0].listUnit[0].factor;

      // const factorPcsQty = item.qty * factorPcs;
      // const factorCtnQty = Math.floor(factorPcsQty / factorCtn);

      // console.log("factorPcsQty",factorPcsQty,"factorCtnQty",factorCtnQty)

      // อัปเดต Stock
      // await Stock.findOneAndUpdate(
      //   {
      //     area: item.area,
      //     period: period(),
      //     'listProduct.productId': item.id
      //   },
      //   {
      //     $inc: {
      //       'listProduct.$[elem].balancePcs': +factorPcsQty,
      //       'listProduct.$[elem].balanceCtn': +factorCtnQty
      //     }
      //   },
      //   {
      //     arrayFilters: [{ 'elem.productId': item.id }],
      //     new: true,
      // session // สำคัญ!
      // }
      // );
    }

    // ลบ Cart ทั้งหมด (ตามเงื่อนไขที่คุณต้องการ)
    await Cart.deleteMany({})

    // ถ้าทุกอย่างสำเร็จ, commit transaction
    // await session.commitTransaction();
    // session.endSession();

    return { success: true }
  } catch (error) {
    // ถ้าเกิด error, rollback ทุกอย่าง
    // await session.abortTransaction();
    // session.endSession();
    console.error('❌ Error in DeleteCartDaily:', error)
    return { error: true, message: error.message }
  }
}

async function reStoreStock (channel = 'cash') {
  const logFile = path.join(
    process.cwd(),
    `${pathLog}startCronJobreStoreStockDaily.txt`
  )
  const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
  try {
    const periodstr = period()
    const { Stock } = getModelsByChannel(channel, null, stockModel)
    const { Product } = getModelsByChannel(channel, null, productModel)
    const { Refund } = getModelsByChannel(channel, null, refundModel)
    const { AdjustStock } = getModelsByChannel(channel, null, adjustStockModel)
    const { Distribution } = getModelsByChannel(
      channel,
      null,
      distributionModel
    )
    const { Order } = getModelsByChannel(channel, null, orderModel)
    const { Giveaway } = getModelsByChannel(channel, null, giveModel)
    const { User } = getModelsByChannel(channel, null, userModel)
    const { Cart } = getModelsByChannel(channel, null, cartModel)

    await restock('', periodstr, channel, 'update')

    console.log('ReStoreSucess')
    fs.appendFileSync(logFile, `[${now}] ✅ Job completed ReStoreSucess\n`)
  } catch (err) {
    console.error(err)
    fs.appendFileSync(logFile, `[${now}] ❌ Job failed: ${err.message}\n`)
    // return res.status(500).json({ status: 500, message: err.message })
  }
}

async function updateOrderPowerBI (channel = 'cash') {
  const logFile = path.join(
    process.cwd(),
    `${pathLog}startCronJobUpdateOrderPowerBI.txt`
  )
  const nowLog = new Date().toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok'
  })

  try {
    const now = new Date()
    const thailandOffset = 7 * 60 // นาที
    const utc = now.getTime() + now.getTimezoneOffset() * 60000
    const thailand = new Date(utc + thailandOffset * 60000)

    const year = thailand.getFullYear()
    const month = String(thailand.getMonth() + 1).padStart(2, '0')
    const day = String(thailand.getDate()).padStart(2, '0')
    const nextDay = String(thailand.getDate() + 1).padStart(2, '0')

    const currentDate = `${year}${month}${day}`
    const startDate = `${year}${month}${day}`
    const endDate = `${year}${month}${nextDay}`
    const status = ''

    const { Order } = getModelsByChannel(channel, null, orderModel)
    const { Product } = getModelsByChannel(channel, null, productModel)
    const { Refund } = getModelsByChannel(channel, null, refundModel)
    const { Store } = getModelsByChannel(channel, null, storeModel)

    const invoBi = await dataPowerBiQuery(channel, 'INVO')
    const invoBiList = invoBi.flatMap(item => item.INVO)

    const invoM3 = await dataM3Query(channel)
    const invoM3List = invoM3.flatMap(item => item.OACUOR)

    const allTransactions = await dataPowerBi(
      channel,
      invoBiList,
      status,
      startDate,
      endDate,
      currentDate
    )
    await dataPowerBiQueryInsert(channel, allTransactions)

    const invoBiAfter = await dataPowerBiQuery(channel, 'INVO')
    const invoBiListAfter = invoBiAfter.flatMap(item => item.INVO)

    let alreadyM3 = []
    for (const item of invoBiListAfter) {
      if (invoM3List.includes(item)) {
        alreadyM3.push(item)
      }
    }

    await dataPowerBiQueryDelete(channel, alreadyM3)

    fs.appendFileSync(
      logFile,
      `[${nowLog}] ✅ Job completed updatePowerBiSucess\n`
    )
  } catch (err) {
    console.error(err)
    fs.appendFileSync(logFile, `[${nowLog}] ❌ Job failed: ${err.message}\n`)
    // return res.status(500).json({ status: 500, message: err.message })
  }
}

const startCronJobUpdateOrderPowerBI = () => {
  cron.schedule(
    '0 21 * * *', // 👉 00:00 AM (เวลาไทย)
    // "*/3 * * * *",

    async () => {
      console.log(
        'Running cron job startCronJobUpdateOrderPowerBI at 21:00 AM Thai time. Now:',
        new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
      )
      await updateOrderPowerBI()
    },
    {
      timezone: 'Asia/Bangkok' // 👈 สำคัญมาก
    }
  )
}

const startCronJobUpdatBIOrderDistribution = () => {
  cron.schedule(
    '0 21 * * *', // 👉 00:00 AM (เวลาไทย)
    // "*/3 * * * *",

    async () => {
      console.log(
        'Running cron job startCronJobUpdatBIOrderDistribution at 21:00 AM Thai time. Now:',
        new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
      )
      await updateStatusOrderDistribution()
    },
    {
      timezone: 'Asia/Bangkok' // 👈 สำคัญมาก
    }
  )
}

const startCronJobUpdateOrderDistribution = () => {
  cron.schedule(
    '0 21 * * *', // 👉 00:00 AM (เวลาไทย)
    // "*/3 * * * *",

    async () => {
      console.log(
        'Running cron job startCronJobUpdateOrderDistribution at 21:00 AM Thai time. Now:',
        new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
      )
      await updateOrderDistribution()
    },
    {
      timezone: 'Asia/Bangkok' // 👈 สำคัญมาก
    }
  )
}

async function updateStatusOrderDistribution (channel = 'cash') {
  const logFile = path.join(
    process.cwd(),
    `${pathLog}updateStatusOrderDistribution.txt`
  )

  const nowLog = new Date().toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok'
  })
  try {
    const now = new Date()
    const currentMonth = now.getMonth() + 1 // (0-based, so add 1)
    const currentYear = now.getFullYear()
    const { Distribution } = getModelsByChannel(
      channel,
      null,
      distributionModel
    )
    // ✅ 1. ดึงข้อมูลจาก WithdrawCash
    const withdrawList = await WithdrawCash.findAll({
      where: {
        WD_STATUS: '22',
        [Op.and]: [
          where(fn('MONTH', col('WD_DATE')), currentMonth),
          where(fn('YEAR', col('WD_DATE')), currentYear)
        ]
      },
      raw: true
    })
    // ✅ 2. สร้าง list WD_NO
    const wdNos = [...new Set(withdrawList.map(i => i.WD_NO))]

    // ✅ 3. ดึงข้อมูลจาก Distribution (Mongo)
    const dataDis = await Distribution.find({
      orderId: { $in: wdNos }
    }).lean()

    // ✅ 4. สร้าง map จาก Mongo เพื่อหาของเร็ว
    // ✅ รวม dis + listProduct ลงใน Map
    const disMap = new Map()
    for (const dis of dataDis) {
      if (!dis.listProduct) continue
      disMap.set(dis.orderId, { dis, listProduct: dis.listProduct })
    }

    // ✅ 5. วนลูปอัปเดตแต่ละแถวใน WithdrawCash

    // ✅ ใช้ตอนอัปเดต
    for (const row of withdrawList) {
      const data = disMap.get(row.WD_NO)
      if (!data) continue

      const { dis, listProduct } = data
      const product = listProduct.find(p => p.id === row.ITEM_CODE)

      if (product) {
        await WithdrawCash.update(
          {
            WD_STATUS: dis.status == 'confirm' ? '99' : '22',
            ITEM_WEIGHT: product.weightGross ?? 0,
            TOTAL_WEIGHT: product.weightNet ?? 0,
            SHIP_QTY: product.receiveQty ?? 0,
            STATUS: dis.status ?? '',
            STATUS_TH: dis.statusTH ?? '',
            REMARK_WAREHOUSE: dis.remarkWarehouse?.remark ?? '',
            IS_NPD: product.isNPD ? 'TRUE' : 'FALSE'
          },
          {
            where: {
              WD_NO: row.WD_NO,
              ITEM_CODE: row.ITEM_CODE
            }
          }
        )
      }
    }
    fs.appendFileSync(
      logFile,
      `[${nowLog}] ✅ Job completed updatePowerBiSucess\n`
    )
  } catch (error) {
    console.error(err)
    fs.appendFileSync(logFile, `[${nowLog}] ❌ Job failed: ${err.message}\n`)
    // return res.status(500).json({ status: 500, message: err.message })
  }
}

async function updateOrderDistribution (channel = 'cash') {
  const logFile = path.join(
    process.cwd(),
    `${pathLog}startCronJobUpdateOrderDistribution.txt`
  )

  const nowLog = new Date().toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok'
  })
  try {
    const now = new Date()
    const thailandOffset = 7 * 60 // นาที
    const utc = now.getTime() + now.getTimezoneOffset() * 60000
    const thailand = new Date(utc + thailandOffset * 60000)

    const year = thailand.getFullYear()
    const month = String(thailand.getMonth() + 1).padStart(2, '0')
    const day = String(thailand.getDate() - 1).padStart(2, '0')
    const nextDay = String(thailand.getDate()).padStart(2, '0')

    const currentDate = `${year}${month}${day}`
    const startDate = `${year}${month}${day}`
    // const startDate = `20250901`
    const endDate = `${year}${month}${nextDay}`
    // const endDate = `20250930`
    const status = ''
    const channel = 'cash'

    const allTransactions = await dataWithdraw(
      channel,
      status,
      startDate,
      endDate
    )
    await dataWithdrawInsert(channel, allTransactions)
    fs.appendFileSync(
      logFile,
      `[${nowLog}] ✅ Job completed updatePowerBiSucess\n`
    )
  } catch (error) {
    console.error(error)
    fs.appendFileSync(logFile, `[${nowLog}] ❌ Job failed: ${error.message}\n`)
    // return res.status(500).json({ status: 500, message: err.message })
  }
}

const startCronJobDistribution = () => {
  cron.schedule(
    '0 21 * * *', // 👉 00:00 AM (เวลาไทย)
    // "*/3 * * * *",

    async () => {
      console.log(
        'Running cron job startCronJobDistribution at 21:00 AM Thai time. Now:',
        new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
      )
      await updateOrderDistribution()
    },
    {
      timezone: 'Asia/Bangkok' // 👈 สำคัญมาก
    }
  )
}

const startCronJobErpApiCheck = () => {
  cron.schedule(
    '0 8 * * *', // 👉 6:00 AM (เวลาไทย)
    // "* * * * *",
    async () => {
      console.log(
        'Running cron job startCronJobErpApiCheck at 8:00 AM Thai time. Now:',
        new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
      )
      await erpApiCheckOrderJob()
    },
    {
      timezone: 'Asia/Bangkok' // 👈 สำคัญมาก
    }
  )
}

const startCronJobErpApiCheckDisribution = () => {
  cron.schedule('*/10 * * * *', async () => {
    console.log(
      'Running cron job startCronJobErpApiCheckDisribution every 10 minutes'
    )
    await erpApiCheckDisributionM3Job()
  })
}

const startCronJobDeleteCartDaily = () => {
  cron.schedule(
    '0 0 * * *',
    async () => {
      // cron.schedule('*/1 * * * *', async () => {
      console.log('Running cron job DeleteCartDaily at 00:00 (Asia/Bangkok)')
      await DeleteCartDaily()
    },
    {
      timezone: 'Asia/Bangkok'
    }
  )
}
// const startCronJobreStoreStockDaily = () => {
// cron.schedule(
//   '* * * * *',  async () => {
//     console.log('Running cron job reStoreStock at 01:00 (Asia/Bangkok)')
//     await reStoreStock()
//   },
//   {
//     timezone: 'Asia/Bangkok' // บังคับให้ตีความตามเวลาไทย
//   }
// )
// }

const startCronJobreStoreStockDaily = () => {
  cron.schedule(
    '30 21 * * *', // 21:30 ทุกวัน
    // "* * * * *", // 👉 ทุก 5 นาที
    async () => {
      console.log(
        'Running cron job reStoreStock at 21:30 Bangkok time. Now:',
        new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
      )
      await reStoreStock()
    },
    {
      timezone: 'Asia/Bangkok' // 👈 สำคัญ
    }
  )
}

// const startCronJobreStoreStockDaily = () => {
//   cron.schedule(
//     '* * * * *', // ทุก 1 นาที
//     async () => {
//       console.log(
//         'Running cron job reStoreStock every 1 minute. Now:',
//         new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
//       );
//       await reStoreStock();
//     },
//     {
//       timezone: 'Asia/Bangkok' // 👈 สำคัญ
//     }
//   );
// };

module.exports = {
  startCronJobErpApiCheck,
  // startCronJobOrderToExcel
  startCronJobUpdateOrderDistribution,
  startCronJobUpdateOrderPowerBI,
  startCronJobErpApiCheckDisribution,
  startCronJobDeleteCartDaily,
  startCronJobDistribution,
  startCronJobreStoreStockDaily,
  startCronJobUpdatBIOrderDistribution
}
