const express = require('express')
const { getOrder, getDetail, updateStatus, checkout, addSlip, OrderToExcel, getAllOrder, getSummaryItem } = require('../../controllers/sale/orderController')

const router = express.Router()

router.get('/all', getOrder)
router.get('/detail/:orderId', getDetail)
router.post('/updateStatus', updateStatus)
router.post('/checkout', checkout)
router.post('/addSlip', addSlip)

router.post('/addSlip', addSlip)
router.get('/ordertoexcel/:saleCode', OrderToExcel);
router.get('/getAllOrder', getAllOrder)
router.get('/getSummaryItem', getSummaryItem)

module.exports = router