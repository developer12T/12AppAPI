const express = require('express')
const {
  addStock,
  available,
  addStockNew,
  fetchArea,
  getQty,
  stockToExcel,
  getProduct,
  addStockMovement,
  rollbackStock
} = require('../../controllers/stock/stockController')

const router = express.Router()

router.post('/add', addStock)
router.get('/available', available)
// router.post('/rollbackStock', rollbackStock)
router.post('/get', getQty)
router.post('/addStockMovement', addStockMovement)
// router.post('/getProductAndStock', getProductAndStock)

router.post('/addNew', addStockNew)
// router.post('/stocktoexcel', stockToExcel)
// router.get('/movement', available)
module.exports = router
