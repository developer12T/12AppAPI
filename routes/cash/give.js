const express = require('express')
const { addGiveType, getGiveType, getGiveProductFilter, getGiveStoreFilter, getOrder, getDetail, checkout } = require('../../controllers/give/giveController')

const router = express.Router()

router.post('/addGiveType', addGiveType)
router.get('/getGiveType', getGiveType)
router.post('/getProductFilter', getGiveProductFilter)
router.get('/getStoreFilter', getGiveStoreFilter)
router.get('/all', getOrder)
router.get('/detail/:orderId', getDetail)
router.post('/checkout', checkout)

module.exports = router