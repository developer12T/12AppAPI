const express = require('express')
const cashRoute = require('./cash/index')
const pcRoute = require('./foodtruck/index')
const router = express.Router()

router.use('/cash', cashRoute)
router.use('/pc', pcRoute)
module.exports = router