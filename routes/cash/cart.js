const express = require('express')
const { getCart, addProduct, adjustProduct, deleteProduct, getQty } = require('../../controllers/cart/cartController')

const router = express.Router()

router.get('/get', getCart)
router.post('/add', addProduct)
router.patch('/adjust', adjustProduct)
router.post('/delete', deleteProduct)
router.post('/getQty', getQty)

module.exports = router