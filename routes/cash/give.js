const express = require('express')
const {
  addGiveType,
  getGiveType,
  getGiveProductFilter,
  getGiveStoreFilter,
  getOrder,
  getDetail,
  checkout,
  getGiveaways,
  getGiveawaysDetail,
  addimageGive,
  approveGive,
  updateStatus,
  giveToExcel,
  fixOrderIdsGive
} = require('../../controllers/give/giveController')

const router = express.Router()
router.post('/addimageGive', addimageGive)
router.post('/addGiveType', addGiveType)
router.get('/getGiveType', getGiveType)
router.post('/getProductFilter', getGiveProductFilter)
router.get('/getStoreFilter', getGiveStoreFilter)
router.get('/all', getOrder)
router.get('/detail/:orderId', getDetail)
router.post('/checkout', checkout)
router.get('/getGiveaways', getGiveaways)
router.get('/fixOrderIdsGive', fixOrderIdsGive)


router.post('/approveGive', approveGive)
router.post('/updateStatus', updateStatus)

router.get('/giveToExcel', giveToExcel)


router.get('/getGiveawaysDetail/:giveId', getGiveawaysDetail)
module.exports = router
