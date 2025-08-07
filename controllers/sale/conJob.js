const cron = require('node-cron')
// const { erpApiCheckOrder,erpApiCheckDisributionM3 } = require('../../controllers/sale/orderController')
const { OrderToExcelConJob } = require('../../controllers/sale/orderController')
const { period, } = require('../../utilities/datetime')
const { to2, updateStockMongo } = require('../../middleware/order')


const { Warehouse, Locate, Balance, Sale, DisributionM3 } = require('../../models/cash/master')
const fs = require('fs');

const { sequelize, DataTypes } = require('../../config/m3db')
const { getSocket } = require('../../socket')

const disributionModel = require('../../models/cash/distribution')
const cartModel = require('../../models/cash/cart')
const orderModel = require('../../models/cash/sale')
const stockModel = require('../../models/cash/stock')
const productModel = require('../../models/cash/product')
const { getModelsByChannel } = require('../../middleware/channel')
const { create } = require('lodash')

async function erpApiCheckOrderJob(channel = 'cash') {
  try {
    const { Order } = getModelsByChannel(channel, null, orderModel);

    // 1. Get sale order numbers (OAORNO) ที่มีใน Sale
    const modelSale = await Sale.findAll({
      attributes: [
        'OACUOR',
        [sequelize.fn('COUNT', sequelize.col('OACUOR')), 'count']
      ],
      group: ['OACUOR']
    });
    const saleIds = modelSale.map(row => row.get('OACUOR').toString());

    // 2. Get pending orderIds ใน MongoDB
    const inMongo = await Order.find({ status: 'pending' }).select('orderId');
    const orderIdsInMongo = inMongo.map(item => item.orderId.toString());

    // 3. filter ให้เหลือเฉพาะที่อยู่ทั้งสองฝั่ง
    const matchedIds = orderIdsInMongo.filter(id => saleIds.includes(id));

    // 4. อัปเดตทุกตัวที่ match (วนทีละตัว)
    let updatedCount = 0;
    for (const orderId of matchedIds) {
      try {
        const result = await Order.updateOne(
          { orderId },
          { $set: { status: 'completed', statusTH: 'สำเร็จ', updatedAt: new Date() } }
        );
        if (result.modifiedCount > 0) updatedCount++;
      } catch (err) {
        console.error(`Error update orderId: ${orderId}`, err);
      }
    }

    const io = getSocket()
    io.emit('order/statusOrderUpdated', {
      updatedCount,
      updatedAt: new Date()
    })

    // });

    console.log(`Total updated Order: ${updatedCount}`);
    return updatedCount;

  } catch (error) {
    console.error('❌ Error in erpApiCheckOrderJob:', error);
    return { error: true, message: error.message };
  }
}

async function erpApiCheckDisributionM3Job(channel = 'cash') {
  try {
    const { Distribution } = getModelsByChannel(channel, null, disributionModel);

    // 1. Get order numbers (MGTRNR) ที่มีใน DisributionM3
    const modelSale = await DisributionM3.findAll({
      attributes: [
        'MGTRNR',
        [sequelize.fn('COUNT', sequelize.col('MGTRNR')), 'count']
      ],
      group: ['MGTRNR']
    });
    const distributionIds = modelSale.map(row => row.get('MGTRNR').toString());

    // 2. Get pending orderIds ใน MongoDB
    const inMongo = await Distribution.find({ status: 'pending' }).select('orderId');
    const orderIdsInMongo = inMongo.map(item => item.orderId.toString());

    // 3. filter ให้เหลือเฉพาะที่อยู่ทั้งสองฝั่ง
    const matchedIds = orderIdsInMongo.filter(id => distributionIds.includes(id));

    if (!matchedIds.length) {
      console.log('No new order Distribution found in the M3 system');
      return { updated: false, updatedCount: 0 };
    }

    // 4. อัปเดตทุกตัวที่ match (วนทีละตัว)
    let updatedCount = 0;
    for (const orderId of matchedIds) {
      try {
        const result = await Distribution.updateOne(
          { orderId },
          { $set: { status: 'completed', statusTH: 'สำเร็จ', updatedAt: new Date() } }
        );
        if (result.modifiedCount > 0) updatedCount++;
      } catch (err) {
        console.error(`Error update orderId: ${orderId}`, err);
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


    console.log(`Total updated Distribution: ${updatedCount}`);
    return updatedCount;

  } catch (error) {
    console.error('❌ Error in erpApiCheckDisributionM3Job:', error);
    return { error: true, message: error.message };
  }
}


async function DeleteCartDaily(channel = 'cash') {
  // เปิด session สำหรับ transaction
  // const session = await mongoose.startSession();
  // session.startTransaction();

  try {
    const { Cart } = getModelsByChannel(channel, null, cartModel);
    const { Stock } = getModelsByChannel(channel, null, stockModel);
    const { Product } = getModelsByChannel(channel, null, productModel);

    // ดึงข้อมูล cart ทั้งหมด (เช่นเดิม)
    await Cart.deleteMany({ type: 'withdraw' });

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
    );

    const listPromotion = data.flatMap(sub =>
      sub.listPromotion.flatMap(item => item.listProduct.map(y => ({
        storeId: sub.storeId,
        area: sub.area,
        id: y.id,
        unit: y.unit,
        qty: y.qty
      })))
    );

    for (const item of [...listProduct, ...listPromotion]) {
      // console.log(item)
      // console.log(item)
      // await updateStockMongo(item, item.area, period(), 'deleteCart', channel)
      const updateResult = await updateStockMongo(item, item.area, period(), 'deleteCart', channel);
      if (updateResult) return;
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
    await Cart.deleteMany({});

    // ถ้าทุกอย่างสำเร็จ, commit transaction
    // await session.commitTransaction();
    // session.endSession();

    return { success: true };

  } catch (error) {
    // ถ้าเกิด error, rollback ทุกอย่าง
    // await session.abortTransaction();
    // session.endSession();
    console.error('❌ Error in DeleteCartDaily:', error);
    return { error: true, message: error.message };
  }
}



const startCronJobErpApiCheck = () => {
  cron.schedule('*/10 * * * *', async () => {
    console.log('Running cron job startCronJobErpApiCheck every 10 minutes')
    await erpApiCheckOrderJob()
  })
}

const startCronJobErpApiCheckDisribution = () => {
  cron.schedule('*/10 * * * *', async () => {
    console.log('Running cron job startCronJobErpApiCheckDisribution every 10 minutes')
    await erpApiCheckDisributionM3Job()
  })
}

const startCronJobDeleteCartDaily = () => {
  cron.schedule('0 0 * * *', async () => {
    // cron.schedule('*/1 * * * *', async () => {
    console.log('Running cron job DeleteCartDaily at 00:00 (Asia/Bangkok)');
    await DeleteCartDaily();
  },
    {
      timezone: 'Asia/Bangkok'
    }
  );
}





module.exports = {
  startCronJobErpApiCheck,
  // startCronJobOrderToExcel
  startCronJobErpApiCheckDisribution,
  startCronJobDeleteCartDaily
};