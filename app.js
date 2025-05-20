const express = require('express')
const bodyParser = require('body-parser')
const morgan = require('morgan')
const cors = require('cors')
const routeIndex = require('./routes/index')
// const startCronJob = require('./controllers/sale/conJob')
const app = express()
const { startCronJobOrderToExcel } = require('../12AppAPI/controllers/sale/conJob');


startCronJobOrderToExcel()

app.use(bodyParser.json({ limit: '50mb' }))
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }))
app.use('/images', express.static('/var/www/12AppAPI/public/images'));

// Middleware
app.use(bodyParser.json())
// startCronJob()
app.use(morgan('dev'))
app.use(cors({
    origin: '*',
}));

// Routes
app.use('/api', routeIndex)

module.exports = app