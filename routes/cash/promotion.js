const express = require('express')
const {
  addPromotion,
  getPromotionProduct,
  getPromotion,
  addPromotionLimit,
  updatePromotionLimit,
  addQuota,
  updateQuota,
  addPromotionShelf,
  updatePromotion,
  getPromotionDetail,
  deletePromotion,
  addPromotionM3,
  getReward,
  getPromotionPc
} = require('../../controllers/promotion/promotionController')

const router = express.Router()

router.post('/add', addPromotion)
router.post('/updatePromotion', updatePromotion)
router.post('/addPromotionM3', addPromotionM3)

router.post('/changeProduct', getPromotionProduct)
router.get('/getPromotion', getPromotion)
router.get('/getPromotionDetail', getPromotionDetail)

router.post('/addPromotionLimit', addPromotionLimit)
router.post('/updatePromotionLimit', updatePromotionLimit)
router.post('/addQuota', addQuota)
router.post('/updateQuota', updateQuota)
router.post('/addPromotionShelf', addPromotionShelf)

router.post('/deletePromotion', deletePromotion)
router.post('/getReward', getReward)
router.post('/getPromotionPc', getPromotionPc)
module.exports = router
