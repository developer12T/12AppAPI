const express = require('express')
const {
  getUser,
  editUser,
  addImage,
  getQRcode,
  addUser,
  addUserOne,
  updateUserOne,
  addAndUpdateUser,
  
} = require('../../controllers/user/userController')

const router = express.Router()

router.get('/getUser', getUser)
router.patch('/editUser', editUser)
router.post('/addImage', addImage)
router.get('/qrcode', getQRcode)
router.post('/addUser', addUser)
router.post('/addUserOne', addUserOne)
router.patch('/updateUserOne', updateUserOne)
router.post('/addAndUpdateUser', addAndUpdateUser)

module.exports = router
