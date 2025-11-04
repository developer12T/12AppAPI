const express = require('express')


const {
    checkout,
    orderIdDetailFoodtruck
} = require('../../controllers/noodle/noodleSalesController')


const router = express.Router()


router.post('/checkout', checkout)
router.get('/orderIdDetailFoodtruck', orderIdDetailFoodtruck)
// router.get('/getNoodleItem', getNoodleItem)
module.exports = router