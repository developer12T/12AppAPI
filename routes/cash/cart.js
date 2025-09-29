const express = require('express')
const {
  getCart,
  addProduct,
  adjustProduct,
  deleteProduct,
  updateStock,
  getCartAll,
  clearCartAll,
  autoDeleteCart,
  getCountCart
} = require('../../controllers/cart/cartController')

const router = express.Router()

router.get('/get', getCart)
router.get('/getall', getCartAll)
router.post('/add', addProduct)
router.patch('/adjust', adjustProduct)
router.post('/delete', deleteProduct)
router.post('/clearcart', clearCartAll)
router.post('/updateStock', updateStock)
router.post('/autoDeleteCart', autoDeleteCart)
router.get('/getCountCart', getCountCart)
module.exports = router
