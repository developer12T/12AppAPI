const express = require('express')


const {
  addSendMoney,
  addSendMoneyImage,
  getSendMoney,
  getAllSendMoney,
  getSendMoneyForAcc
} = require('../../controllers/sendmoney/sendmoneyController')
const router = express.Router()
router.post('/addSendMoney', addSendMoney)
router.post('/addSendMoneyImage', addSendMoneyImage)
router.post('/getSendMoney', getSendMoney)
router.get('/getAllSendMoney', getAllSendMoney)
router.get('/getSendMoneyForAcc', getSendMoneyForAcc)
module.exports = router