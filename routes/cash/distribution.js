const express = require('express')
const {
  checkout,
  getOrder,
  getDetail,
  updateStatus,
  updateStockWithdraw,
  insertWithdrawToErp,
  insertOneWithdrawToErp,
  addFromERPWithdraw,
  approveWithdraw,
  saleConfirmWithdraw,
  getReceiveQty,
  withdrawBackOrderToExcel,
  getOrderCredit,
  updateReciveFix
} = require('../../controllers/distribution/withdrawController')
const {
  getPlace,
  addPlace,
  getType,
  addAllPlace,
  addWereHouse
} = require('../../controllers/distribution/placeController')

const router = express.Router()

router.get('/get', getOrder)
router.get('/getCredit', getOrderCredit)
router.get('/detail/:orderId', getDetail)
router.post('/checkout', checkout)
router.post('/updateStatus', updateStatus)
router.get('/getType', getType)

router.get('/place/get', getPlace)
router.post('/place/add', addPlace)

router.post('/place/addAllPlace', addAllPlace)

router.post('/updateStockWithdraw', updateStockWithdraw)
router.post('/updateReciveFix', updateReciveFix)
router.post('/insertWithdrawToErp', insertWithdrawToErp)
router.post('/insertOneWithdrawToErp', insertOneWithdrawToErp)
router.post('/addFromERPWithdraw', addFromERPWithdraw)
router.post('/approveWithdraw', approveWithdraw)

router.post('/addWereHouse', addWereHouse)
router.post('/saleConfirmWithdraw', saleConfirmWithdraw)

router.post('/getReceiveQty', getReceiveQty)
router.get('/withdrawBackOrderToExcel', withdrawBackOrderToExcel)
module.exports = router
