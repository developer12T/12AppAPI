const express = require('express')
const { getOrder, getDetail, updateStatus, checkout, addSlip, transaction } = require('../../controllers/sale/orderController')

const router = express.Router()

router.get('/all', getOrder)
router.get('/detail/:orderId', getDetail)
router.post('/updateStatus', updateStatus)
router.post('/checkout', checkout)
router.post('/addSlip', addSlip)
router.get('/movement', transaction)

module.exports = router