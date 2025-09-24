const express = require('express')
const {
  getRefund,
  getDetail,
  checkout,
  addSlip,
  updateStatus,
  deleteRefund,
  refundExcel,
  cancelApproveRefund
} = require('../../controllers/refund/refundController')

const router = express.Router()

router.get('/all', getRefund)
router.get('/detail/:orderId', getDetail)
router.post('/checkout', checkout)
router.get('/refundExcel', refundExcel)
router.post('/addSlip', addSlip)
router.post('/updateStatus', updateStatus) 
router.post('/deleteRefund', deleteRefund)
router.post('/cancelApproveRefund', cancelApproveRefund)
module.exports = router
