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
const fs = require('fs')

const { sequelize, DataTypes } = require('../../config/m3db')
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

const { getModelsByChannel } = require('../../middleware/channel')
const { create } = require('lodash')

async function erpApiCheckOrderJob (channel = 'cash') {
  try {
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)

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
    return summaryCount
  } catch (error) {
    console.error('❌ Error in erpApiCheckOrderJob:', error)
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

    const { startDate, endDate } = rangeDate(periodstr)

    // 1) เตรียม unique areas
    const userData = await User.find({ role: 'sale' }).select('area')
    const rawAreas = userData
      .flatMap(u => (Array.isArray(u.area) ? u.area : [u.area]))
      .filter(Boolean)
    const uniqueAreas = [...new Set(rawAreas)]
    // uniqueAreas = ['CT224']
    // 2) ฟังก์ชันย่อย: ประมวลผลต่อ 1 area
    const buildAreaStock = async area => {
      // สร้าง match สำหรับ collections ต่าง ๆ
      let areaQuery = {}
      if (area) {
        if (area.length === 2) areaQuery.zone = area.slice(0, 2)
        else if (area.length === 5) areaQuery.area = area
      }

      let areaQueryRefund = {}
      if (area) {
        if (area.length === 2) areaQueryRefund['store.zone'] = area.slice(0, 2)
        else if (area.length === 5) areaQueryRefund['store.area'] = area
      }

      const matchQuery = { ...areaQuery, period: periodstr }
      const matchQueryRefund = { ...areaQueryRefund, period: periodstr }

      const dataRefund = await Refund.aggregate([
        {
          $match: {
            ...matchQueryRefund,
            status: { $in: ['completed', 'approved'] }
          }
        },
        { $project: { listProduct: 1, _id: 0 } }
      ])

      const dataWithdraw = await Distribution.aggregate([
        { $match: { status: 'confirm', ...matchQuery } },
        {
          $project: {
            _id: 0,
            listProduct: {
              $filter: {
                input: '$listProduct',
                as: 'item',
                cond: { $gt: ['$$item.receiveQty', 0] }
              }
            }
          }
        },
        { $unwind: '$listProduct' },
        {
          $lookup: {
            from: 'products',
            localField: 'listProduct.id',
            foreignField: 'id',
            as: 'prod'
          }
        },
        { $unwind: '$prod' },
        {
          $set: {
            factor: {
              $let: {
                vars: {
                  matched: {
                    $first: {
                      $filter: {
                        input: '$prod.listUnit',
                        as: 'u',
                        cond: { $eq: ['$$u.unit', '$listProduct.unit'] }
                      }
                    }
                  }
                },
                in: { $ifNull: ['$$matched.factor', 1] }
              }
            }
          }
        },
        {
          $set: {
            'listProduct.qtyPcs': {
              $multiply: ['$listProduct.receiveQty', '$factor']
            }
          }
        },
        { $group: { _id: '$_id', listProduct: { $push: '$listProduct' } } },
        { $project: { _id: 0, listProduct: 1 } }
      ])

      const dataOrder = await Order.aggregate([
        { $addFields: { zone: { $substrBytes: ['$area', 0, 2] } } },
        { $match: { type: 'sale', status: { $ne: 'canceled' } } },
        { $match: matchQueryRefund },
        { $project: { listProduct: 1, listPromotions: 1, _id: 0 } }
      ])

      const dataChange = await Order.aggregate([
        { $addFields: { zone: { $substrBytes: ['$area', 0, 2] } } },
        {
          $match: { type: 'change', status: { $in: ['approved', 'completed'] } }
        },
        { $match: matchQueryRefund },
        { $project: { listProduct: 1, _id: 0 } }
      ])

      const dataAdjust = await AdjustStock.aggregate([
        { $addFields: { zone: { $substrBytes: ['$area', 0, 2] } } },
        {
          $match: {
            type: 'adjuststock',
            status: { $in: ['approved', 'completed'] }
          }
        },
        { $match: matchQuery },
        { $project: { listProduct: 1, _id: 0 } }
      ])

      const dataGive = await Giveaway.aggregate([
        { $addFields: { zone: { $substrBytes: ['$area', 0, 2] } } },
        { $match: { type: 'give', status: { $nin: ['canceled', 'reject'] } } },
        { $match: matchQueryRefund },
        { $project: { listProduct: 1, _id: 0 } }
      ])

      const dataCart = await Cart.aggregate([
        {
          $match: {
            type: { $in: ['give', 'refund', 'sale'] },
            area,
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        { $project: { listProduct: 1, _id: 0, zone: 1 } }
      ])

      const dataChangePending = await Order.aggregate([
        { $addFields: { zone: { $substrBytes: ['$area', 0, 2] } } },
        { $match: { type: 'change', status: 'pending' } },
        { $match: matchQueryRefund },
        { $project: { listProduct: 1, _id: 0 } }
      ])

      const allWithdrawProducts = dataWithdraw.flatMap(
        doc => doc.listProduct || []
      )
      const allRefundProducts = dataRefund.flatMap(doc => doc.listProduct || [])
      const allOrderProducts = dataOrder.flatMap(doc => doc.listProduct || [])
      const allOrderPromotion = dataOrder.flatMap(
        doc => doc.listPromotions || []
      )
      const allChangeProducts = dataChange.flatMap(doc => doc.listProduct || [])
      const allAdjustProducts = dataAdjust.flatMap(doc => doc.listProduct || [])
      const allGiveProducts = dataGive.flatMap(doc => doc.listProduct || [])
      const allCartProducts = dataCart.flatMap(doc => doc.listProduct || [])
      const allChangePendingProducts = dataChangePending.flatMap(
        doc => doc.listProduct || []
      )

      const dataStock = await Stock.aggregate([
        { $addFields: { zone: { $substrBytes: ['$area', 0, 2] } } },
        { $match: matchQuery },
        { $project: { listProduct: 1, _id: 0 } }
      ])

      // console.log(matchQuery)

      if (dataStock.length === 0) {
        return {
          area,
          periodstr,
          data: [],
          summaries: null,
          note: 'Not found this area'
        }
      }

      const refundProductArray = Object.values(
        allRefundProducts.reduce((acc, curr) => {
          const key = `${curr.id}_${curr.unit}_${curr.condition}`
          if (acc[key]) {
            acc[key] = {
              ...curr,
              qty: (acc[key].qty || 0) + (curr.qty || 0),
              qtyPcs: (acc[key].qtyPcs || 0) + (curr.qtyPcs || 0)
            }
          } else acc[key] = { ...curr }
          return acc
        }, {})
      )

      const withdrawProductArray = Object.values(
        allWithdrawProducts.reduce((acc, curr) => {
          // สร้าง key สำหรับ group
          const key = `${curr.id}_${curr.unit}`

          // ลบ qty เดิมออกก่อน
          const { qty, ...rest } = curr

          if (acc[key]) {
            // ถ้ามีอยู่แล้ว ให้เพิ่มจากค่าใหม่
            acc[key].qty += curr.receiveQty || 0
            acc[key].qtyPcs += curr.qtyPcs || 0
          } else {
            // ถ้ายังไม่มี ให้สร้างใหม่ พร้อม qty จาก receiveQty
            acc[key] = {
              ...rest,
              qty: curr.receiveQty || 0,
              qtyPcs: curr.qtyPcs || 0
            }
          }
          return acc
        }, {})
      )

      const orderProductArray = Object.values(
        allOrderProducts.reduce((acc, curr) => {
          const key = `${curr.id}_${curr.unit}`
          if (acc[key]) {
            acc[key] = {
              ...curr,
              qty: (acc[key].qty || 0) + (curr.qty || 0),
              qtyPcs: (acc[key].qtyPcs || 0) + (curr.qtyPcs || 0)
            }
          } else acc[key] = { ...curr }
          return acc
        }, {})
      )

      const mergedProductPromotions = allOrderPromotion.reduce((acc, promo) => {
        ;(promo.listProduct || []).forEach(prod => {
          const key = `${prod.id}_${prod.unit}`
          if (acc[key]) {
            acc[key].qty += prod.qty || 0
            acc[key].qtyPcs += prod.qtyPcs || 0
          } else {
            acc[key] = { ...prod, qty: prod.qty || 0, qtyPcs: prod.qtyPcs || 0 }
          }
        })
        return acc
      }, {})
      const orderPromotionArray = Object.values(mergedProductPromotions)

      const changeProductArray = Object.values(
        allChangeProducts.reduce((acc, curr) => {
          const key = `${curr.id}_${curr.unit}`
          if (acc[key]) {
            acc[key] = {
              ...curr,
              qty: (acc[key].qty || 0) + (curr.qty || 0),
              qtyPcs: (acc[key].qtyPcs || 0) + (curr.qtyPcs || 0)
            }
          } else acc[key] = { ...curr }
          return acc
        }, {})
      )

      const adjustProductArray = Object.values(
        allAdjustProducts.reduce((acc, curr) => {
          const key = `${curr.id}_${curr.unit}`
          if (acc[key]) {
            acc[key] = {
              ...curr,
              qty: (acc[key].qty || 0) + (curr.qty || 0),
              qtyPcs: (acc[key].qtyPcs || 0) + (curr.qtyPcs || 0)
            }
          } else acc[key] = { ...curr }
          return acc
        }, {})
      )

      const giveProductArray = Object.values(
        allGiveProducts.reduce((acc, curr) => {
          const key = `${curr.id}_${curr.unit}`
          if (acc[key]) {
            acc[key] = {
              ...curr,
              qty: (acc[key].qty || 0) + (curr.qty || 0),
              qtyPcs: (acc[key].qtyPcs || 0) + (curr.qtyPcs || 0)
            }
          } else acc[key] = { ...curr }
          return acc
        }, {})
      )

      const cartProductArray = Object.values(
        allCartProducts.reduce((acc, curr) => {
          const key = `${curr.id}_${curr.unit}`
          if (acc[key]) {
            acc[key] = {
              ...curr,
              qty: (acc[key].qty || 0) + (curr.qty || 0),
              qtyPcs: (acc[key].qtyPcs || 0) + (curr.qtyPcs || 0)
            }
          } else acc[key] = { ...curr }
          return acc
        }, {})
      )

      const changePendingProductArray = Object.values(
        allChangePendingProducts.reduce((acc, curr) => {
          const key = `${curr.id}_${curr.unit}`
          if (acc[key]) {
            acc[key] = {
              ...curr,
              qty: (acc[key].qty || 0) + (curr.qty || 0),
              qtyPcs: (acc[key].qtyPcs || 0) + (curr.qtyPcs || 0)
            }
          } else acc[key] = { ...curr }
          return acc
        }, {})
      )

      const dataStockTran = dataStock
      const productIdListStock = dataStockTran.flatMap(item =>
        item.listProduct.map(u => u.productId)
      )
      const productIdListWithdraw = withdrawProductArray.flatMap(
        item => item.id
      )
      const productIdListRefund = refundProductArray.flatMap(item => item.id)
      const productIdListOrder = orderProductArray.flatMap(item => item.id)
      const productIdListPromotion = orderPromotionArray.flatMap(
        item => item.id
      )
      const productIdListChange = changeProductArray.flatMap(item => item.id)
      const productIdListAdjust = adjustProductArray.flatMap(item => item.id)
      const productIdListGive = giveProductArray.flatMap(item => item.id)
      const productIdListCart = cartProductArray.flatMap(item => item.id)
      const productIdListChangePending = changePendingProductArray.flatMap(
        item => item.id
      )

      const uniqueProductId = [
        ...new Set([
          ...productIdListStock,
          ...productIdListWithdraw,
          ...productIdListRefund,
          ...productIdListOrder,
          ...productIdListPromotion,
          ...productIdListChange,
          ...productIdListAdjust,
          ...productIdListGive,
          ...productIdListCart,
          ...productIdListChangePending
        ])
      ]

      const allProducts = dataStockTran.flatMap(item => item.listProduct)
      const haveProductIdSet = new Set(allProducts.map(p => p.productId))

      // เติม product ที่ไม่มีใน stock แต่โผล่ในธุรกรรมอื่น
      uniqueProductId.forEach(productId => {
        if (!haveProductIdSet.has(productId)) {
          allProducts.push({
            productId,
            stockPcs: 0,
            balancePcs: 0,
            stockCtn: 0,
            balanceCtn: 0
          })
        }
      })

      // รวมตาม productId
      const sumById = {}
      for (const u of allProducts) {
        const id = u.productId
        if (!sumById[id]) {
          sumById[id] = {
            id,
            stockPcs: u.stockPcs || 0,
            balancePcs: u.balancePcs || 0,
            stockCtn: u.stockCtn || 0,
            balanceCtn: u.balanceCtn || 0
          }
        } else {
          sumById[id].stockPcs += u.stockPcs || 0
          sumById[id].balancePcs += u.balancePcs || 0
          sumById[id].stockCtn += u.stockCtn || 0
          sumById[id].balanceCtn += u.balanceCtn || 0
        }
      }
      const productSum = Object.values(sumById)

      const dataProduct = await Product.find({
        id: { $in: uniqueProductId }
      }).select('id name listUnit')

      let data = []
      let summaryStock = 0
      let summaryWithdraw = 0
      let summaryGood = 0
      let summaryDamaged = 0
      let summarySale = 0
      let summaryPromotion = 0
      let summaryChange = 0
      let summaryAdjust = 0
      let summaryGive = 0
      let summaryStockBal = 0
      let summaryStockPcs = 0
      let summaryStockBalPcs = 0

      for (const stockItem of productSum) {
        const productDetail = dataProduct.find(u => u.id == stockItem.id)
        const productDetailRefund = refundProductArray.filter(
          u => u.id == stockItem.id
        )
        const productDetailWithdraw = withdrawProductArray.filter(
          u => u.id == stockItem.id
        )
        const productDetailOrder = orderProductArray.filter(
          u => u.id == stockItem.id
        )
        const productDetailPromotion = orderPromotionArray.filter(
          u => u.id == stockItem.id
        )
        const productDetailChange = changeProductArray.filter(
          u => u.id == stockItem.id
        )
        const productDetailAdjust = adjustProductArray.filter(
          u => u.id == stockItem.id
        )
        const productDetailGive = giveProductArray.filter(
          u => u.id == stockItem.id
        )

        const productDetailCart = cartProductArray.filter(
          u => u.id == stockItem.id
        )

        const productDetailChangePending = changePendingProductArray.filter(
          u => u.id == stockItem.id
        )

        if (!productDetail) continue

        const pcsMain = stockItem.stockPcs
        let stock = stockItem.stockPcs
        let balance = stockItem.balancePcs
        summaryStockPcs += stockItem.stockPcs || 0
        summaryStockBalPcs += stockItem.balancePcs || 0

        const listUnitStock = productDetail.listUnit.map(u => {
          const goodQty =
            productDetailRefund.find(
              i => i.unit === u.unit && i.condition === 'good'
            )?.qty ?? 0
          const damagedQty =
            productDetailRefund.find(
              i => i.unit === u.unit && i.condition === 'damaged'
            )?.qty ?? 0
          const withdrawQty =
            productDetailWithdraw.find(i => i.unit === u.unit)?.qty ?? 0
          const saleQty =
            productDetailOrder.find(i => i.unit === u.unit)?.qty ?? 0
          const promoQty =
            productDetailPromotion.find(i => i.unit === u.unit)?.qty ?? 0
          const changeQty =
            productDetailChange.find(i => i.unit === u.unit)?.qty ?? 0
          const adjustQty =
            productDetailAdjust.find(i => i.unit === u.unit)?.qty ?? 0
          const giveQty =
            productDetailGive.find(i => i.unit === u.unit)?.qty ?? 0
          const cartQty =
            productDetailCart.find(i => i.unit === u.unit)?.qty ?? 0
          const changePendingQty =
            productDetailChangePending.find(i => i.unit === u.unit)?.qty ?? 0

          const goodSale = u.price?.refund ?? 0
          const damagedSale = u.price?.refundDmg ?? 0
          const changeSale = u.price?.change ?? 0
          const sale = u.price?.sale ?? 0
          const factor = u.factor || 1

          const stockQty = Math.floor((stock || 0) / factor) || 0
          const balanceQty = Math.floor((balance || 0) / factor) || 0

          stock -= stockQty * factor
          balance -= balanceQty * factor

          summaryStock += (stockQty || 0) * sale
          summaryStockBal += (balanceQty || 0) * sale
          summaryWithdraw += (withdrawQty || 0) * sale
          summaryGood += (goodQty || 0) * goodSale
          summaryDamaged += (damagedQty || 0) * damagedSale
          summarySale += (saleQty || 0) * sale
          summaryPromotion += (promoQty || 0) * sale
          summaryChange += (changeQty || 0) * changeSale
          summaryAdjust += (adjustQty || 0) * sale
          summaryGive += (giveQty || 0) * sale

          return {
            unit: u.unit,
            unitName: u.name,
            stock: stockQty,
            withdraw: withdrawQty,
            good: goodQty,
            damaged: damagedQty,
            sale: saleQty,
            cart: cartQty,
            promotion: promoQty,
            changePending: changePendingQty,
            change: changeQty,
            adjust: adjustQty,
            give: giveQty,
            balance: balanceQty
          }
        })

        const [pcs, ctn] = calculateStockSummary(productDetail, listUnitStock)
        const summaryQty = { PCS: pcs, CTN: ctn }

        data.push({
          productId: stockItem.id,
          productName: productDetail.name,
          pcsMain,
          summaryQty
        })
      }

      // sort + ลบ pcsMain ก่อนส่ง
      data.sort((a, b) => b.pcsMain - a.pcsMain)
      data.forEach(item => {
        delete item.pcsMain
      })

      return {
        area,
        periodstr,
        data
        // summaries: {
        //   summaryStock:       Number(summaryStock.toFixed(2)),
        //   summaryStockBal:    Number(summaryStockBal.toFixed(2)),
        //   summaryWithdraw:    Number(summaryWithdraw.toFixed(2)),
        //   summaryGood:        Number(summaryGood.toFixed(2)),
        //   summaryDamaged:     Number(summaryDamaged.toFixed(2)),
        //   summarySale:        Number(summarySale.toFixed(2)),
        //   summaryPromotion:   Number(summaryPromotion.toFixed(2)),
        //   summaryChange:      Number(summaryChange.toFixed(2)),
        //   summaryAdjust:      Number(summaryAdjust.toFixed(2)),
        //   summaryGive:        Number(summaryGive.toFixed(2)),
        //   summaryStockPcs:    Number(summaryStockPcs.toFixed(2)),
        //   summaryStockBalPcs: Number(summaryStockBalPcs.toFixed(2)),
        // }
      }
    }

    // 3) วนตาม area (จะขนานหรือทีละตัวก็ได้)
    const results = []
    for (const area of uniqueAreas) {
      const r = await buildAreaStock(area)
      results.push(r)
      // console.log(area)
    }

    // console.log(results)
    for (const item of results) {
      for (const i of item.data) {
        const filter = {
          area: item.area,
          period: periodstr,
          'listProduct.productId': i.productId
        }
        // console.log(i.summaryQty.PCS.in)

        const update = {
          $set: {
            'listProduct.$[elem].stockInPcs': i.summaryQty.PCS.in,
            'listProduct.$[elem].stockOutPcs': i.summaryQty.PCS.out,
            'listProduct.$[elem].balancePcs': i.summaryQty.PCS.balance,
            'listProduct.$[elem].stockInCtn': i.summaryQty.CTN.in,
            'listProduct.$[elem].stockOutCtn': i.summaryQty.CTN.out,
            'listProduct.$[elem].balanceCtn': i.summaryQty.CTN.balance
          }
        }

        const options = {
          arrayFilters: [{ 'elem.productId': i.productId }],
          new: true
        }

        // Try update first
        const updatedDoc = await Stock.findOneAndUpdate(filter, update, options)

        // If product not found in listProduct, push a new one
        if (!updatedDoc) {
          await Stock.updateOne(
            { area: item.area, period: periodstr },
            {
              $push: {
                listProduct: {
                  productId: i.productId,
                  stockPcs: 0,
                  stockInPcs: i.summaryQty.PCS.in,
                  stockOutPcs: i.summaryQty.PCS.out,
                  balancePcs: i.summaryQty.PCS.balance,
                  stockCtn: 0,
                  stockInCtn: i.summaryQty.CTN.in,
                  stockOutCtn: i.summaryQty.CTN.out,
                  balanceCtn: i.summaryQty.CTN.balance
                }
              }
            }
          )
        }
      }
    }

    console.log('ReStoreSucess')
  } catch (err) {
    console.error(err)
    // return res.status(500).json({ status: 500, message: err.message })
  }
}

const startCronJobErpApiCheck = () => {
  cron.schedule(
    '0 6 * * *', // 👉 6:00 AM (เวลาไทย)
    async () => {
      console.log(
        'Running cron job startCronJobErpApiCheck at 6:00 AM Thai time. Now:',
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
  startCronJobErpApiCheckDisribution,
  startCronJobDeleteCartDaily,
  startCronJobreStoreStockDaily
}
