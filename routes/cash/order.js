const express = require('express')
const { getOrder, getDetail, updateStatus, checkout, addSlip, OrderToExcel } = require('../../controllers/sale/orderController')

const router = express.Router()

router.get('/all', getOrder)
router.get('/detail/:orderId', getDetail)
router.post('/updateStatus', updateStatus)
router.post('/checkout', checkout)
router.post('/addSlip', addSlip)

router.post('/addSlip', addSlip)
router.post('/ordertoexcel',OrderToExcel)


module.exports = router