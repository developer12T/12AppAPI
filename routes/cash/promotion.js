const express = require('express')
const { addPromotion, getPromotionProduct } = require('../../controllers/promotion/promotionController')

const router = express.Router()

router.post('/add', addPromotion)
router.post('/changeProduct', getPromotionProduct)

module.exports = router