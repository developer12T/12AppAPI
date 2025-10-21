const express = require('express')


const {
    addSendMoneyImageMuti,

} = require('../../controllers/noodle/noodleSendMoneyController')


const router = express.Router()


router.post('/addSendMoneyImageMuti', addSendMoneyImageMuti)
// router.get('/getNoodleItem', getNoodleItem)
module.exports = router