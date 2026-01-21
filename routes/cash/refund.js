const express = require('express')
const {
  getRefund,
  getDetail,
  checkout,
  addSlip,
  updateStatus,
  deleteRefund,
  refundExcel,
  cancelApproveRefund,
  updateAddressChange,
  getRefundPending
} = require('../../controllers/refund/refundController')

const router = express.Router()

router.get('/all', getRefund)
router.get('/getRefundPending', getRefundPending)
router.get('/detail/:orderId', getDetail)
router.post('/checkout', checkout)
router.get('/refundExcel', refundExcel)
router.get('/refundExcel2', refundExcel)
router.post('/addSlip', addSlip)
router.post('/updateStatus', updateStatus) 
router.post('/deleteRefund', deleteRefund)
router.post('/cancelApproveRefund', cancelApproveRefund)
router.post('/updateAddressChange', updateAddressChange)
module.exports = router
