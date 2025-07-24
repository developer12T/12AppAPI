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
  getDetailStore,
  insertStoreToErpOne,
  checkSimilarStores,
  getShipping,
  addShippingInStore,
  deleteShippingFromStore,
  editShippingInStore,
  deleteStore,
  updateStoreStatusNoNewId
  // test
} = require('../../controllers/store/storeController')

const {
  addCallCard,
  delCallCard,
  addFlowAction,
  getCallCard,
  updateDetailStore,
  updateDailyvisit,
  updateGooglemap,
  addVisit
} = require('../../controllers/store/callCardController')

const router = express.Router()

router.get('/getStore', getStore)
router.get('/getTypeStore', getTypeStore)
router.get('/check/:storeId', checkSimilarStores)
router.get('/:storeId', getDetailStore)
router.post('/addStore', addStore)
router.post('/updateImage', updateImage)
router.post('/addFromERP', addFromERP)
router.post('/addFromERPnew', addFromERPnew)
router.patch('/editStore/:storeId', editStore)
router.post('/checkIn/:storeId', checkInStore)
router.post('/updateStoreStatus', updateStoreStatus)
router.post('/rejectStore', rejectStore)
router.post('/getShipping', getShipping)
router.post('/addAndUpdateStore', addAndUpdateStore)
router.post('/createRunningNumber', createRunningNumber)
router.post('/updateRunningNumber', updateRunningNumber)
router.post('/addBueatyStore', addBueatyStore)
router.post('/getBueatyStore', getBueatyStore)
router.post('/addStoreArray', addStoreArray)
router.post('/updateStoreArray', updateStoreArray)
router.post('/deleteStoreArray', deleteStoreArray)
router.post('/addTypeStore', addTypeStore)
router.post('/insertStoreToErpOne', insertStoreToErpOne)
router.post('/addShippingInStore', addShippingInStore)
router.post('/deleteShippingFromStore', deleteShippingFromStore)
router.post('/editShippingInStore', editShippingInStore)
router.post('/deleteStore', deleteStore)
router.post('/updateStoreStatusNoNewId', updateStoreStatusNoNewId)

// router.get('/test', test)

router.post('/addCallCard', addCallCard)
router.post('/getCallCard', getCallCard)
router.delete('/delCallCard', delCallCard)
router.post('/addFlowAction', addFlowAction)
router.post('/updateDetailStore', updateDetailStore)
router.post('/updateDailyvisit', updateDailyvisit)
router.post('/updateGooglemap', updateGooglemap)
router.post('/addVisit', addVisit)

module.exports = router
