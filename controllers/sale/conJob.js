const cron = require('node-cron')
const { erpApiCheck } = require('../../controllers/sale/orderController')
const { OrderToExcelConJob } = require('../../controllers/sale/orderController')
const moment = require('moment-timezone');



const startCronJobErpApiCheck = () => {
  cron.schedule('*/5 * * * *', async () => {
    console.log('Running cron job every 5 minutes')
    await erpApiCheck()
  })
}

const startCronJobOrderToExcel = () => {
  const times = [9, 12, 18, 23];

  times.forEach(hour => {
    cron.schedule(`0 ${hour} * * *`, async () => {
      console.log(`Running cron job at ${hour}:00`);
      await OrderToExcelConJob();
    }, {
      timezone: 'Asia/Bangkok' 
    });
  });
};


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
  startCronJobOrderToExcel
};