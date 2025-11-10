const express = require('express')

const {
  addSendMoney,
  addSendMoneyImage,
  getSendMoney,
  getAllSendMoney,
  getSendMoneyForAcc,
  sendmoneyToExcel,
  updateSendmoneyOld,
  updateSendmoneyOld2
} = require('../../controllers/sendmoney/sendmoneyController')
const router = express.Router()
router.post('/addSendMoney', addSendMoney)
router.post('/addSendMoneyImage', addSendMoneyImage)
router.post('/getSendMoney', getSendMoney)
router.get('/getAllSendMoney', getAllSendMoney)
router.get('/getSendMoneyForAcc', getSendMoneyForAcc)
router.get('/sendmoneyToExcel', sendmoneyToExcel)
router.post('/updateSendmoneyOld', updateSendmoneyOld2)
module.exports = router
