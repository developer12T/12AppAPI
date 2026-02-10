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
  downloadUserExcel,
  addUserPcSample,
  getArea,
  getZone,
  addUserPcToPromotionStore,
  updateUserPcToPromotionStore,
  getAreaCredit,
  getZoneCredit,
  getTeamCredit,
  getAreaByZone
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
router.post('/addUserPcSample', addUserPcSample)
router.post('/getArea', getArea)
router.post('/getAreaByZone', getAreaByZone)
router.post('/getZone', getZone)
router.post('/addUserPcToPromotionStore', addUserPcToPromotionStore)
router.post('/updateUserPcToPromotionStore', updateUserPcToPromotionStore)
router.post('/getAreaCredit', getAreaCredit)
router.post('/getZoneCredit', getZoneCredit)
router.get('/getTeamCredit', getTeamCredit)
module.exports = router
