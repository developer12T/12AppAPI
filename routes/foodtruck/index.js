const express = require('express')
const noodleCartRoute = require('./noodleCartRoute')
const noodleItemRoute = require('./noodleItemRoute')
const noodleSaleRoute = require('./noodleSaleRoute')
const noodleMoneyRoute = require('./noodleMoneyRoute')
const router = express.Router()


router.use('/noodleCart', noodleCartRoute)
router.use('/noodleItem', noodleItemRoute)
router.use('/noodlesale', noodleSaleRoute)
router.use('/noodleMoney', noodleMoneyRoute)
module.exports = router