const cron = require('node-cron')
// const { erpApiCheckOrder,erpApiCheckDisributionM3 } = require('../../controllers/sale/orderController')
const { OrderToExcelConJob } = require('../../controllers/sale/orderController')


const { Warehouse, Locate, Balance, Sale, DisributionM3 } = require('../../models/cash/master')
const fs = require('fs');

const { sequelize, DataTypes } = require('../../config/m3db')
const { getSocket } = require('../../socket')

const disributionModel = require('../../models/cash/distribution')
const cartModel = require('../../models/cash/cart')
const orderModel = require('../../models/cash/sale')
const { getModelsByChannel } = require('../../middleware/channel')
const { create } = require('lodash')

async function erpApiCheckOrderJob(channel = 'cash') {
  try {
    const { Order } = getModelsByChannel(channel, null, orderModel);

    const modelSale = await Sale.findAll({
      attributes: [
        'OAORNO',
        [sequelize.fn('COUNT', sequelize.col('OAORNO')), 'count']
      ],
      group: ['OAORNO']
    });

    const saleId = modelSale.map(row => row.get('OAORNO'));
    const cleanSaleId = saleId
      .map(s => (typeof s === 'string' ? s.trim() : s))
      .filter(s => s && s.length > 0);

    // const notInModelOrder = await Order.find({
    //   orderId: { $nin: cleanSaleId }
    // }).select('orderId');
    // console.log(cleanSaleId)
    // const dataOrder = await Order.find()
    // const updateResult = await Order.updateMany(
    //   { orderId: { $in: cleanSaleId } },
    //   { $set: { status: 'success' } }
    // );

    let updatedCount = 0

    for (const id of cleanSaleId) {
      try {
        const result = await Order.updateOne(
          { orderId: id },
          { $set: { status: 'success' } }
        );
        if (result.modifiedCount > 0) {
          updatedCount++
        }
        // ถ้าอยาก log ดูเป็นรายตัว
        // console.log(`orderId: ${id}, modified: ${result.modifiedCount}`);
      } catch (err) {
        console.error(`Error update orderId: ${id}`, err);
      }
    }

    if (updatedCount === 0) {
      console.log('No new order found in the M3 system');
      return { updated: false, updatedCount: 0 };
    } else {
      console.log(`Updated ${updatedCount} order(s)`);

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
      //     message: 'New Update Data',
      //     updatedCount: updateResult.modifiedCount
      //   });
      // });

      return { updated: true, updatedCount };
    }
    // Broadcast


    // return {
    //   updated: true,
    //   updatedCount: updateResult.modifiedCount
    // };
  } catch (error) {
    console.error('❌ Error in erpApiCheckOrderJob:', error);
    return { error: true, message: error.message };
  }
}


async function erpApiCheckDisributionM3Job(channel = 'cash') {
  try {
    const { Distribution } = getModelsByChannel(channel, null, disributionModel);

    // *** ตรวจสอบชื่อ model ให้ถูกต้อง ***
    const modelSale = await DisributionM3.findAll({
      attributes: [
        'MGTRNR',
        [sequelize.fn('COUNT', sequelize.col('MGTRNR')), 'count']
      ],
      group: ['MGTRNR']
    });

    const orderIdList = modelSale.map(row => row.get('MGTRNR').toString());

    const inMongo = await Distribution.find({ status: 'pending' }).select('orderId');

    // แนะนำ: map orderId ให้เป็น string ทั้งหมด
    const orderIdsInMongo = inMongo.map(item => item.orderId.toString());

    // filter orderId ที่ตรงกันเท่านั้น
    const orderidUpdate = orderIdsInMongo.filter(orderId => orderIdList.includes(orderId));

    console.log("orderidUpdate =", orderidUpdate);

    if (!orderidUpdate.length) {
      console.log('No new order Distribution found in the M3 system');
      return { updated: false, updatedCount: 0 };
    } else {
      const updateResult = await Distribution.updateMany(
        { orderId: { $in: orderidUpdate } },
        { $set: { status: 'success', updatedAt: new Date() } }
      );
    }



    return {
      updated: true,
      // updatedCount: updateResult.modifiedCount
    };

  } catch (error) {
    console.error('❌ Error in erpApiCheckDisributionM3Job:', error);
    return { error: true, message: error.message };
  }
}


async function DeleteCartDaily(channel = 'cash') {
  try {
    const { Cart } = getModelsByChannel(channel, null, cartModel);

    const now = new Date();
    // หาค่า 'วันนี้' 00:00 (เวลาไทย)
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const todayStartStr = `${yyyy}-${mm}-${dd}T00:00:00.000+07:00`;
    const todayStartUtc = new Date(todayStartStr);

    // console.log(todayStartUtc); // debug

    const result = await Cart.deleteMany({
      createdAt: { $lt: todayStartUtc }
    });

    console.log(`[DeleteCartDaily] Deleted cart for date ${yyyy}-${mm}-${dd} (ไทย) | count: ${result.deletedCount}`);

  } catch (error) {
    console.error('❌ Error in DeleteCartDaily:', error);
    return { error: true, message: error.message };
  }
}



const startCronJobErpApiCheck = () => {
  cron.schedule('*/1 * * * *', async () => {
    console.log('Running cron job startCronJobErpApiCheck every 10 minutes')
    await erpApiCheckOrderJob()
  })
}

const startCronJobErpApiCheckDisribution = () => {
  cron.schedule('*/1 * * * *', async () => {
    console.log('Running cron job startCronJobErpApiCheckDisribution every 10 minutes')
    await erpApiCheckDisributionM3Job()
  })
}

const startCronJobDeleteCartDaily = () => {
  cron.schedule(
    '0 0 * * *',
    async () => {
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