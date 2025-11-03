const express = require('express')


const {
    addNoodleCart,
    getCartDetailNew,
    deleteProductNoodle
} = require('../../controllers/noodle/noodleCartsController')


const router = express.Router()


router.post('/addNoodleCart', addNoodleCart)
router.get('/getCartDetailNew', getCartDetailNew)
router.post('/deleteProductNoodle', deleteProductNoodle)
module.exports = router