const express = require('express')
const { addStock, available, getProductAndStock, addStockNew, fetchArea } = require('../../controllers/stock/stockController')

const router = express.Router()
 
router.post('/add', addStock)
router.get('/available', available)
router.post('/getProductAndStock', getProductAndStock)

router.post('/addNew', addStockNew)
// router.get('/movement', available)
module.exports = router
