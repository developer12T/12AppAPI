const express = require('express')


const {
  addSendMoney,
  getSendMoney
} = require('../../controllers/sendmoney/sendmoneyController')
const router = express.Router()
router.post('/addSendMoney', addSendMoney)
router.post('/getSendMoney', getSendMoney)
module.exports = router