const express = require('express')
const { addPromotion, getPromotionProduct,getPromotion } = require('../../controllers/promotion/promotionController')

const router = express.Router()

router.post('/add', addPromotion)
router.post('/changeProduct', getPromotionProduct)
router.get('/getPromotion', getPromotion)

module.exports = router