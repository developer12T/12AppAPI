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
  updateStoreStatusNoNewId,
  fixStatusStore,
  insertStoreToM3,
  storeToExcel,
  updateStatusM3ToMongo,
  addImageLatLong,
  getLatLongOrder,
  getLatLongOrderDetail,
  approveLatLongStore,
  canceledOrderLatLongStore,
  addLatLong,
  getStorePage,
  getPendingStore,
  getLatLongOrderPending,
  updateStoreAddressIt,
  checkRangeLatLong,
  checkNewStoreLatLong,
  updateAreaStore,
  areaStoreM3toMongo,
  checkLatLongByStore,
  addStoreFromM3
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
router.get('/storeToExcel', storeToExcel)
router.get('/getLatLongOrderPending', getLatLongOrderPending)
router.get('/getStore', getStore)
router.get('/getTypeStore', getTypeStore)
router.get('/check/:storeId', checkSimilarStores)
router.get('/getLatLongOrder', getLatLongOrder)
router.get('/getLatLongOrderDetail', getLatLongOrderDetail)
router.post('/approveLatLongStore', approveLatLongStore)
router.post('/canceledOrderLatLongStore', canceledOrderLatLongStore)
router.get('/getStorePage', getStorePage)


router.post('/addStore', addStore)
router.post('/updateImage', updateImage)
router.post('/insertStoreToM3', insertStoreToM3)
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
router.post('/fixStatusStore', fixStatusStore)
router.post('/updateStatusM3ToMongo', updateStatusM3ToMongo)
router.post('/getPendingStore', getPendingStore)
router.post('/addStoreFromM3', addStoreFromM3)
// router.get('/test', test)

router.post('/addCallCard', addCallCard)
router.post('/getCallCard', getCallCard)
router.delete('/delCallCard', delCallCard)
router.post('/addFlowAction', addFlowAction)
router.post('/updateDetailStore', updateDetailStore)
router.post('/updateDailyvisit', updateDailyvisit)
router.post('/updateGooglemap', updateGooglemap)
router.post('/addVisit', addVisit)
router.post('/addImageLatLong', addImageLatLong)
router.post('/addLatLong', addLatLong)
router.post('/updateStoreAddressIt', updateStoreAddressIt)
router.get('/checkRangeLatLong', checkRangeLatLong)
router.get('/checkNewStoreLatLong', checkNewStoreLatLong)
router.post('/updateAreaStore', updateAreaStore)

router.post('/areaStoreM3toMongo', areaStoreM3toMongo)
router.post('/checkLatLongByStore', checkLatLongByStore)

router.get('/:storeId', getDetailStore)
module.exports = router
