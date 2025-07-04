const express = require('express')


const {
    addCampaign,
    getCampaign
} = require('../../controllers/campaign/campaignController')


const router = express.Router()


router.post('/addCampaign', addCampaign)
router.get('/getCampaign', getCampaign)
module.exports = router