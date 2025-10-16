const express = require('express')
const noodleCartRoute = require('./noodleCartRoute')


const router = express.Router()


router.use('/noodleCart', noodleCartRoute)


module.exports = router