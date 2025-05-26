const express = require('express')
const { checkout, getOrder, getDetail, updateStatus,updateStockWithdraw } = require('../../controllers/distribution/withdrawController')
const { getPlace, addPlace, getType, addAllPlace } = require('../../controllers/distribution/placeController')

const router = express.Router()

router.get('/get', getOrder)
router.get('/detail/:orderId', getDetail)
router.post('/checkout', checkout)
router.post('/updateStatus', updateStatus)
router.get('/getType', getType)

router.get('/place/get', getPlace)
router.post('/place/add', addPlace)

router.post('/place/addAllPlace', addAllPlace)

router.post('/updateStockWithdraw', updateStockWithdraw)


module.exports = router