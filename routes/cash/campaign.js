const express = require('express')


const { addCampaign } = require('../../controllers/campaign/campaignController')


const router = express.Router()


router.post('/addCampaign', addCampaign)

module.exports = router