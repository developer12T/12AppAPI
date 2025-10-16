const express = require('express')


const {
    addNoodleCart
} = require('../../controllers/noodleCarts/noodleCartsController')


const router = express.Router()


router.post('/addNoodleCart', addNoodleCart)

module.exports = router