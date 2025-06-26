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

    // 1. Get sale order numbers (OAORNO) ที่มีใน Sale
    const modelSale = await Sale.findAll({
      attributes: [
        'OAORNO',
        [sequelize.fn('COUNT', sequelize.col('OAORNO')), 'count']
      ],
      group: ['OAORNO']
    });
    const saleIds = modelSale.map(row => row.get('OAORNO').toString());

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
          { $set: { status: 'success', statusTH: 'สำเร็จ', updatedAt: new Date() } }
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
          { $set: { status: 'success', statusTH: 'สำเร็จ', updatedAt: new Date() } }
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

    console.log(`Total updated Distribution: ${updatedCount}`);
    return updatedCount;

  } catch (error) {
    console.error('❌ Error in erpApiCheckDisributionM3Job:', error);
    return { error: true, message: error.message };
  }
}


async function DeleteCartDaily(channel = 'cash') {
  try {
    const { Cart } = getModelsByChannel(channel, null, cartModel);

    const now = new Date();
    const tzOffsetMs = 7 * 60 * 60 * 1000; // เวลาไทย +7

    const bangkokNow = new Date(now.getTime() + tzOffsetMs);
    const yyyy = bangkokNow.getFullYear();
    const mm = bangkokNow.getMonth();
    const dd = bangkokNow.getDate();

    const thaiStart = new Date(Date.UTC(yyyy, mm, dd, 0, 0, 0) - tzOffsetMs);
    const thaiEnd = new Date(Date.UTC(yyyy, mm, dd + 1, 0, 0, 0) - tzOffsetMs);

    // debug
    // console.log('thaiStart:', thaiStart.toISOString());
    // console.log('thaiEnd:', thaiEnd.toISOString());

    const result = await Cart.deleteMany({
      createdAt: { $lt: thaiStart }
    });

    // const data = await Cart.find({
    //   createdAt: { $lt: thaiStart }
    // })

    // console.log(data)




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