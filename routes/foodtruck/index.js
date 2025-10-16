const express = require('express')
const noodleCartRoute = require('./noodleCartRoute')


const router = express.Router()


router.use('/foodtruck', noodleCartRoute)


module.exports = router