const express = require('express')


const {
    checkout,
    orderIdDetailFoodtruck,
    updateStatus,
    updatePickUp,
    updateQrPayment
} = require('../../controllers/noodle/noodleSalesController')


const router = express.Router()


router.post('/checkout', checkout)
router.get('/orderIdDetailFoodtruck', orderIdDetailFoodtruck)
router.post('/updateStatus', updateStatus)
router.post('/updatePickUp', updatePickUp)
router.post('/updateQrPayment', updateQrPayment)
module.exports = router