const express = require('express')
const { getRefund, getDetail, checkout, addSlip, updateStatus } = require('../../controllers/refund/refundController')

const router = express.Router()

router.get('/all', getRefund)
router.get('/detail/:orderId', getDetail)
router.post('/checkout', checkout)
router.post('/addSlip', addSlip)
router.post('/updateStatus', updateStatus)

module.exports = router