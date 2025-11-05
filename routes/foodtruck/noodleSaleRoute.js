const express = require('express')


const {
    checkout,
    orderIdDetailFoodtruck,
    updateStatus
} = require('../../controllers/noodle/noodleSalesController')


const router = express.Router()


router.post('/checkout', checkout)
router.get('/orderIdDetailFoodtruck', orderIdDetailFoodtruck)
router.post('/updateStatus', updateStatus)
module.exports = router