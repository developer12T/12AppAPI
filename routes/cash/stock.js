const express = require('express')
const { addStock, available } = require('../../controllers/stock/stockController')

const router = express.Router()

router.post('/add', addStock)
router.get('/available', available)
// router.get('/movement', available)

module.exports = router