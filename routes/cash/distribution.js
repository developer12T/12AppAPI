const express = require('express')
const multer = require('multer')
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
  updateReciveFix,
  getOrderSup,
  cancelWithdraw,
  withdrawCheckM3,
  withdrawToExcel,
  withdrawUpdateMGTRDT,
  getWithdrawError,
  UpdateWithdrawConjob,
  getOrderPending,
  approveWithdrawCredit,
  getOrder2,
  addRemark,
  addOneWithdraw,
  uploadNPDData
} = require('../../controllers/distribution/withdrawController')
const {
  getPlace,
  addPlace,
  getType,
  addAllPlace,
  addWereHouse,
  getWareHouse
} = require('../../controllers/distribution/placeController')

const router = express.Router()
const upload = multer({ dest: 'uploads/' })

router.get('/get', getOrder)
router.get('/get2', getOrder2)
router.get('/getOrderPending', getOrderPending)
// router.post('/getw', getOrderWareHouse)

router.get('/getsup', getOrderSup)
router.get('/getCredit', getOrderCredit)
router.get('/detail/:orderId', getDetail)
router.post('/checkout', checkout)
router.post('/updateStatus', updateStatus)
router.post('/cancelWithdraw', cancelWithdraw)
router.get('/getType', getType)

router.get('/place/get', getPlace)
router.post('/place/add', addPlace)
router.post('/uploadNPDData', upload.single('file'), uploadNPDData)

router.post('/addRemark', addRemark)

router.post('/place/addAllPlace', addAllPlace)

router.post('/updateStockWithdraw', updateStockWithdraw)
router.post('/updateReciveFix', updateReciveFix)
router.post('/insertWithdrawToErp', insertWithdrawToErp)
router.post('/insertOneWithdrawToErp', insertOneWithdrawToErp)
router.post('/addFromERPWithdraw', addFromERPWithdraw)
router.post('/approveWithdraw', approveWithdraw)

router.post('/addWereHouse', addWereHouse)
router.get('/getWareHouse', getWareHouse)
router.post('/saleConfirmWithdraw', saleConfirmWithdraw)

router.post('/getReceiveQty', getReceiveQty)
router.get('/withdrawBackOrderToExcel', withdrawBackOrderToExcel)
router.post('/withdrawUpdateMGTRDT', withdrawUpdateMGTRDT)
router.post('/withdrawCheckM3', withdrawCheckM3)
router.post('/getWithdrawError', getWithdrawError)
router.post('/UpdateWithdrawConjob', UpdateWithdrawConjob)
router.post('/approveWithdrawCredit', approveWithdrawCredit)
router.post('/addOneWithdraw', addOneWithdraw)
module.exports = router
