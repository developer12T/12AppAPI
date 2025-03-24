const express = require('express')
const cashRoute = require('./cash/index')

const router = express.Router()

router.use('/cash', cashRoute)

module.exports = router