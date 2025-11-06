const express = require('express')


const {
    checkout,
    orderIdDetailFoodtruck,
    // updateStatus,
    updatePickUp
} = require('../../controllers/noodle/noodleSalesController')


const router = express.Router()


router.post('/checkout', checkout)
router.get('/orderIdDetailFoodtruck', orderIdDetailFoodtruck)
// router.post('/updateStatus', updateStatus)
router.post('/updatePickUp', updatePickUp)
module.exports = router