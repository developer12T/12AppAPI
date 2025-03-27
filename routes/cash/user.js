const express = require('express')
const { getUser, editUser, addImage, getQRcode } = require('../../controllers/user/userController')

const router = express.Router()

router.get('/getUser', getUser)
router.patch('/editUser', editUser)
router.post('/addImage', addImage)
router.get('/qrcode', getQRcode)

module.exports = router