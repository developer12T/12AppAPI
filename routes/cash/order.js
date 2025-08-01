const express = require('express')
const { getOrder, getDetail, updateStatus, checkout, addSlip, OrderToExcel, getAllOrder, getSummaryItem, getSummarybyRoute, 
    getSummarybyMonth, getSummarybyArea,getSummarybyGroup,erpApiCheck,getSummarybyChoice,getSaleSummaryByStore,getGroup,
    getSummaryProduct, getProductLimit, 
    // erpApiCheckOrder, 
    // erpApiCheckDisributionM3,
    summaryAllProduct,
    summaryDaily,
    summaryMonthlyByZone,
    saleReport,
    getSummary18SKU,
    reportCheckin

 } = require('../../controllers/sale/orderController')

const router = express.Router()

router.get('/all', getOrder)
router.get('/detail/:orderId', getDetail)
router.post('/updateStatus', updateStatus)
router.post('/checkout', checkout)
router.post('/addSlip', addSlip)

router.post('/addSlip', addSlip)
router.get('/ordertoexcel', OrderToExcel);
router.get('/getAllOrder', getAllOrder)
router.post('/getSummaryItem', getSummaryItem)
router.get('/getSummarybyRoute', getSummarybyRoute)
router.get('/getSummarybyMonth', getSummarybyMonth)
router.get('/getSummarybyArea', getSummarybyArea)
router.post('/getSummarybyGroup', getSummarybyGroup)
// router.get('/erpApiCheck', erpApiCheckOrder)
// router.get('/erpApiCheckDisributionM3', erpApiCheckDisributionM3)

router.post('/getSummarybyChoice', getSummarybyChoice)
router.post('/getSaleSummaryByStore', getSaleSummaryByStore)
router.get('/getGroup', getGroup)
router.get('/getSummaryProduct', getSummaryProduct)
router.get('/getProductLimit', getProductLimit)
router.get('/summaryAllProduct', summaryAllProduct)
router.get('/summaryDaily', summaryDaily)
router.post('/summaryMonthlyByZone', summaryMonthlyByZone)
router.get('/saleReport', saleReport)
router.get('/getSummary18SKU', getSummary18SKU)
router.post('/reportCheckin', reportCheckin)
module.exports = router