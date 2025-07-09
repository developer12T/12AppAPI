const express = require('express')
const {
  getStore,
  addStore,
  updateImage,
  editStore,
  checkInStore,
  addFromERP,
  updateStoreStatus,
  rejectStore,
  addAndUpdateStore,
  createRunningNumber,
  updateRunningNumber,
  addBueatyStore,
  getBueatyStore,
  addFromERPnew,
  addStoreArray,
  updateStoreArray,
  deleteStoreArray,
  getTypeStore,
  addTypeStore,
  insertStoreToErpOne
  // test
} = require('../../controllers/store/storeController')


const { addCallCard, getCallCard, delCallCard, addFlowAction } = require('../../controllers/store/callCardController')




const router = express.Router()

router.get('/getStore', getStore)
router.post('/addStore', addStore)
router.post('/updateImage', updateImage)
router.post('/addFromERP', addFromERP)
router.post('/addFromERPnew', addFromERPnew)
router.patch('/editStore/:storeId', editStore)
router.post('/checkIn/:storeId', checkInStore)
router.post('/updateStoreStatus', updateStoreStatus)
router.post('/rejectStore', rejectStore)
router.post('/addAndUpdateStore', addAndUpdateStore)
router.post('/createRunningNumber', createRunningNumber)
router.post('/updateRunningNumber', updateRunningNumber)
router.post('/addBueatyStore', addBueatyStore)
router.post('/getBueatyStore', getBueatyStore)
router.post('/addStoreArray', addStoreArray)
router.post('/updateStoreArray', updateStoreArray)
router.post('/deleteStoreArray', deleteStoreArray)
router.get('/getTypeStore', getTypeStore)
router.post('/addTypeStore', addTypeStore)
router.post('/insertStoreToErpOne', insertStoreToErpOne)

// router.get('/test', test)

router.post('/addCallCard', addCallCard)
router.get('/getCallCard', getCallCard)
router.delete('/delCallCard', delCallCard)
router.post('/addFlowAction', addFlowAction)






module.exports = router
