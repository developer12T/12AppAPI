const express = require('express')
const {
  getCart,
  addProduct,
  adjustProduct,
  deleteProduct,
  updateStock
} = require('../../controllers/cart/cartController')

const router = express.Router()

router.get('/get', getCart)
router.post('/add', addProduct)
router.patch('/adjust', adjustProduct)
router.post('/delete', deleteProduct)
router.post('/updateStock', updateStock)
module.exports = router
