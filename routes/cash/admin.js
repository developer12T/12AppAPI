const express = require('express')
const {
  reportCheck,
} = require('../../controllers/admin/adminController')


const router = express.Router()



router.get('/reportCheck', reportCheck)


module.exports = router
