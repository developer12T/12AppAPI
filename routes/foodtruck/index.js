const express = require('express')
const noodleCartRoute = require('./noodleCartRoute')
const noodleItemRoute = require('./noodleItemRoute')

const router = express.Router()


router.use('/noodleCart', noodleCartRoute)
router.use('/noodleItem', noodleItemRoute)

module.exports = router