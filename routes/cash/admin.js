const express = require('express')
const {
  reportCheck,
  reportCheckExcel,
} = require('../../controllers/admin/adminController')


const router = express.Router()



router.get('/reportCheck', reportCheck)
router.get('/reportCheckExcel', reportCheckExcel)

module.exports = router
