const express = require('express')
const bodyParser = require('body-parser')
const morgan = require('morgan')
const cors = require('cors')
const routeIndex = require('./routes/index')
const app = express()
// require('dotenv').config()
const {
  startCronJobErpApiCheck,
  startCronJobErpApiCheckDisribution,

  startCronJobreStoreStockDaily,
  startCronJobMemory,

  startCronJobInsertDistribution,
  startCronJobUpdateStatusDistribution,

  startCronJobInsertPowerBI,
  // startCronJobUpdateSendmoney
} = require('../12AppAPI/controllers/sale/conJob')

if (process.env.CA_DB_URI === process.env.UAT_CHECK) {
  startCronJobErpApiCheck()
  startCronJobInsertPowerBI()
  startCronJobreStoreStockDaily()
  // startCronJobMemory()
  startCronJobInsertDistribution()
  startCronJobUpdateStatusDistribution()
  // startCronJobUpdateSendmoney()
}

// startCronJobUpdateSendmoney()
// startCronJobInsertDistribution()
// startCronJobUpdateStatusDistribution()

app.use(bodyParser.json({ limit: '50mb' }))
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }))
app.use('/images', express.static('/var/www/12AppAPI/public/images'))
app.use('/manual', express.static('/var/www/12AppAPI/public/manual'))
app.use('/campaign', express.static('/var/www/12AppAPI/public/campaign'))

// Middleware
app.use(bodyParser.json())
// startCronJob()
app.use(morgan('dev'))
app.use(
  cors({
    origin: '*'
  })
)

// Routes
app.use('/api', routeIndex)

module.exports = app
