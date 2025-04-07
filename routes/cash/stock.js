const express = require('express')
const { addStock, available, getProductAndStock } = require('../../controllers/stock/stockController')

const router = express.Router()
 
router.post('/add', addStock)
router.get('/available', available)
router.post('/getProductAndStock', getProductAndStock)
// router.get('/movement', available)
module.exports = router
