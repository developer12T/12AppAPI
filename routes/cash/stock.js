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
  getStock,
  addStockFromERP,
  getStockQty,
  getWeightProduct,
  getStockQtyDetail,
  addIncidentStock
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
router.post('/addStockFromERP', addStockFromERP)
router.post('/getStockQty', getStockQty)
router.post('/getWeightProduct', getWeightProduct)
// router.post('/stocktoexcel', stockToExcel)
// router.get('/movement', available)
router.post('/getStockQtyDetail', getStockQtyDetail)
router.post('/addIncidentStock', addIncidentStock)

module.exports = router
