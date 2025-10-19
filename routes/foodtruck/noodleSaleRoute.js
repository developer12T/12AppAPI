const express = require('express')


const {
    checkout,

} = require('../../controllers/noodle/noodleSalesController')


const router = express.Router()


router.post('/checkout', checkout)
// router.get('/getNoodleItem', getNoodleItem)
module.exports = router