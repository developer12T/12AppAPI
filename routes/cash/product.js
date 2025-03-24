const express = require('express')
const { getProductAll, getProduct, searchProduct, getFilters, updateStatus, addFromERP } = require('../../controllers/product/productController')

const router = express.Router()

router.get('/all', getProductAll)
router.post('/get', getProduct)
router.get('/search', searchProduct)
router.post('/filter', getFilters)
router.post('/onOff', updateStatus)
router.post('/addFromERP', addFromERP)

module.exports = router