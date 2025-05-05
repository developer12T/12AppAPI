const express = require('express')
const { getUser, editUser, addImage, getQRcode, addUser } = require('../../controllers/user/userController')

const router = express.Router()

router.get('/getUser', getUser)
router.patch('/editUser', editUser)
router.post('/addImage', addImage)
router.get('/qrcode', getQRcode)
router.post('/addUser', addUser)
module.exports = router