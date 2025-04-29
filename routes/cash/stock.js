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
  rollbackStock,
  updateStockMovement,
  availableStock,
  getStock
} = require('../../controllers/stock/stockController')

const router = express.Router()

router.post('/add', addStock)
router.get('/available', available)
// router.post('/rollbackStock', rollbackStock)
router.post('/get', getQty)
router.post('/addStockMovement', addStockMovement)
router.post('/updateStockMovement', updateStockMovement)
router.get('/', getStock)

// router.post('/getProductAndStock', getProductAndStock)

router.post('/addNew', addStockNew)
router.post('/availableStock', availableStock)
// router.post('/stocktoexcel', stockToExcel)
// router.get('/movement', available)

module.exports = router
