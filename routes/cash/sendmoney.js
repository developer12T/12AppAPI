const express = require('express')


const {
  addSendMoney,
  addSendMoneyImage,
  getSendMoney
} = require('../../controllers/sendmoney/sendmoneyController')
const router = express.Router()
router.post('/addSendMoney', addSendMoney)
router.post('/addSendMoneyImage', addSendMoneyImage)
router.post('/getSendMoney', getSendMoney)
module.exports = router