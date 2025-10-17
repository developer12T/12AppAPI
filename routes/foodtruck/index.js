const express = require('express')
const noodleCartRoute = require('./noodleCartRoute')
const noodleItemRoute = require('./noodleItemRoute')
const noodleSaleRoute = require('./noodleSaleRoute')
const router = express.Router()


router.use('/noodleCart', noodleCartRoute)
router.use('/noodleItem', noodleItemRoute)
router.use('/noodlesale', noodleSaleRoute)
module.exports = router