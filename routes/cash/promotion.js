const express = require('express')
const { addPromotion, getPromotionProduct,getPromotion,addPromotionLimit,updatePromotionLimit } = require('../../controllers/promotion/promotionController')

const router = express.Router()

router.post('/add', addPromotion)
router.post('/changeProduct', getPromotionProduct)
router.get('/getPromotion', getPromotion)
router.post('/addPromotionLimit', addPromotionLimit)
router.post('/updatePromotionLimit', updatePromotionLimit)



module.exports = router