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
  startCronJobAutoLockRouteChange,
  startCronJobreStoreStockDaily,
  startCronJobMemory,

  startCronJobInsertDistribution,
  startCronJobUpdateStatusDistribution,

  startCronJobInsertPowerBI
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
startCronJobAutoLockRouteChange()
// startCronJobUpdateSendmoney()
// startCronJobInsertDistribution()
// startCronJobUpdateStatusDistribution()

app.use(bodyParser.json({ limit: '50mb' }))
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }))
app.use('/images', express.static('/var/www/12AppAPI/public/images'))
app.use('/manual', express.static('/var/www/12AppAPI/public/manual'))
app.use('/campaign', express.static('/var/www/12AppAPI/public/campaign'))

// =============================
// API Metrics Middleware
// =============================
app.use((req, res, next) => {
  const start = process.hrtime() // ความแม่นยำสูงกว่า Date.now()

  res.on('finish', () => {
    const diff = process.hrtime(start)
    const responseTime = (diff[0] * 1e3 + diff[1] / 1e6).toFixed(2) // ms

    const statusCode = res.statusCode
    const method = req.method
    const url = req.originalUrl

    // Log Response Time
    console.log(
      `RT | ${method} ${url} | ${responseTime} ms | status ${statusCode}`
    )

    // Log Error Rate
    if (statusCode >= 500) {
      console.error(`ERR | ${method} ${url} | status ${statusCode}`)
    }
  })

  next()
})

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
// Test
app.use('/api', routeIndex)

module.exports = app
