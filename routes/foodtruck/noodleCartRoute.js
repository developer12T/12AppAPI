const express = require('express')


const {
    addNoodleCart,
    getCartDetailNew
} = require('../../controllers/noodleCarts/noodleCartsController')


const router = express.Router()


router.post('/addNoodleCart', addNoodleCart)
router.get('/getCartDetailNew', getCartDetailNew)
module.exports = router