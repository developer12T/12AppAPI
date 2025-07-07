const express = require('express')
const { addDelivery } = require('../../controllers/delivery/deliveryController')

const router = express.Router()


router.post('/addDelivery', addDelivery)

module.exports = router
