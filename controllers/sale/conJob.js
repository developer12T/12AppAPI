const cron = require('node-cron')
const { runErpCheck } = require('../../controllers/sale/orderController')

const startCronJob = () => {
  cron.schedule('*/5 * * * *', async () => {
    console.log('Running cron job every 5 minutes')
    await runErpCheck()
  })
}

module.exports = startCronJob