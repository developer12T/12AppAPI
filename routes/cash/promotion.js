const express = require('express')
const { addPromotion, getPromotionProduct,getPromotion,addPromotionLimit,updatePromotionLimit,addQuota,
    updateQuota,addPromotionShelf,updatePromotion
 } = require('../../controllers/promotion/promotionController')

const router = express.Router()

router.post('/add', addPromotion)
router.post('/updatePromotion', updatePromotion)

router.post('/changeProduct', getPromotionProduct)
router.get('/getPromotion', getPromotion)
router.post('/addPromotionLimit', addPromotionLimit)
router.post('/updatePromotionLimit', updatePromotionLimit)
router.post('/addQuota', addQuota)
router.post('/updateQuota', updateQuota)
router.post('/addPromotionShelf', addPromotionShelf)


module.exports = router