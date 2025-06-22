const cron = require('node-cron')
// const { erpApiCheckOrder,erpApiCheckDisributionM3 } = require('../../controllers/sale/orderController')
const { OrderToExcelConJob } = require('../../controllers/sale/orderController')


const { Warehouse, Locate, Balance, Sale, DisributionM3 } = require('../../models/cash/master')

const { sequelize, DataTypes } = require('../../config/m3db')
const { getSocket } = require('../../socket')

const disributionModel = require('../../models/cash/distribution')

const orderModel = require('../../models/cash/sale')
const { getModelsByChannel } = require('../../middleware/channel')

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
    const dataOrder = await Order.find()
    // const updateResult = await Order.updateMany(
    //   { orderId: { $in: cleanSaleId } },
    //   { $set: { status: 'success' } }
    // );
    // console.log('saleId ตัวอย่าง:', saleId.slice(0, 10), 'รวมทั้งหมด:', saleId.length)

    // console.log(notInModelOrder)
    // if (updateResult.modifiedCount === 0) {
    //   console.log('No new order found in the M3 system');
    //   return { updated: false, updatedCount: 0 };
    // }

    // Broadcast
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
    // const { Order } = getModelsByChannel(channel, null, orderModel);
    const { Distribution } = getModelsByChannel(channel, null, disributionModel);

    const modelSale = await DisributionM3.findAll({
      attributes: [
        'MGTRNR',
        [sequelize.fn('COUNT', sequelize.col('MGTRNR')), 'count']
      ],
      group: ['MGTRNR']
    });

    const orderIdList = modelSale.map(row => row.get('MGTRNR'));
    // console.log(orderIdList)
    const updateResult = await Distribution.updateMany(
      { orderId: { $in: orderIdList } },
      { $set: { status: 'success' } }
    );

    if (updateResult.modifiedCount === 0) {
      console.log('No new order Distribution found in the M3 system');
      return { updated: false, updatedCount: 0 };
    }

    // console.log('✅ Updated Distribution Order IDs:', orderIdList);

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

    return {
      updated: true,
      updatedCount: updateResult.modifiedCount
    };

  } catch (error) {
    console.error('❌ Error in erpApiCheckDisributionM3Job:', error);
    return { error: true, message: error.message };
  }
}


const startCronJobErpApiCheck = () => {
  cron.schedule('*/1 * * * *', async () => {
    console.log('Running cron job startCronJobErpApiCheck every 5 minutes')
    await erpApiCheckOrderJob()
  })
}

const startCronJobErpApiCheckDisribution = () => {
  cron.schedule('*/1 * * * *', async () => {
    console.log('Running cron job startCronJobErpApiCheckDisribution every 5 minutes')
    await erpApiCheckDisributionM3Job()
  })
}



// const startCronJobErpApiCheck = () => {
//   const times = [9, 12, 18, 23];

//   times.forEach(hour => {
//     cron.schedule(`0 ${hour} * * *`, async () => {
//       console.log(`Running cron job at ${hour}:00`);
//       await erpApiCheck();
//     }, {
//       timezone: 'Asia/Bangkok' 
//     });
//   });
// };







// const startCronJobOrderToExcel = () => {
//   const times = [9, 12, 18, 23];

//   times.forEach(hour => {
//     cron.schedule(`0 ${hour} * * *`, async () => {
//       console.log(`Running cron job at ${hour}:00`);
//       await OrderToExcelConJob();
//     }, {
//       timezone: 'Asia/Bangkok' 
//     });
//   });
// };


// const startCronJobOrderToExcel = () => {
//   const now = moment().tz('Asia/Bangkok');
//   const nextMinute = now.add(1, 'minute');

//   const minute = nextMinute.minute();
//   const hour = nextMinute.hour();

//   const cronExpression = `${minute} ${hour} * * *`;

//   console.log(`✅ Scheduling OrderToExcelConJob at: ${nextMinute.format('YYYY-MM-DD HH:mm:ss')}`);
//   console.log(`🕒 CRON expression: ${cronExpression}`);

//   cron.schedule(cronExpression, async () => {
//     console.log(`[${moment().tz('Asia/Bangkok').format()}] 🔁 Running OrderToExcelConJob`);
//     await OrderToExcelConJob();
//   }, {
//     timezone: 'Asia/Bangkok'
//   });
// };



module.exports = {
  startCronJobErpApiCheck,
  // startCronJobOrderToExcel
  startCronJobErpApiCheckDisribution
};