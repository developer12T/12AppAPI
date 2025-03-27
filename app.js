const express = require('express')
const bodyParser = require('body-parser')
const morgan = require('morgan')
const cors = require('cors')
const routeIndex = require('./routes/index')

const app = express()

app.use(bodyParser.json({ limit: '50mb' }))
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }))

// Middleware
app.use(bodyParser.json())
app.use(morgan('dev'))
app.use(cors({
    origin: '*',
}));

// Routes
app.use('/api', routeIndex)

module.exports = app