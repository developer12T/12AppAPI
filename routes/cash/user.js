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
  addUserManeger,
  addUserNew,
  updateUserArray,
  deleteUserArray,
  addUserArray,
  getAreaAll,
 checkUserLogin,
 getTeam,
 downloadUserExcel
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
router.post('/addUserManeger', addUserManeger)
router.post('/addUserNew', addUserNew)
router.post('/updateUserArray', updateUserArray)
router.post('/deleteUserArray', deleteUserArray)
router.post('/addUserArray', addUserArray)
router.get('/getAreaAll', getAreaAll)
router.get('/checkUserLogin', checkUserLogin)
router.get('/getTeam', getTeam)
router.get('/downloadUserExcel', downloadUserExcel)
module.exports = router
