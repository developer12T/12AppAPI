const express = require('express')
const {
  getRoute,
  addFromERP,
  checkIn,
  checkInNotSale,
  changeRoute,
  routeHistory,
  createRoute,
  getRouteCheckinAll,
  getTimelineCheckin,
  checkInVisit,
  checkInVisitNew,
  routeTimeline,
  updateAndAddRoute,
  getRouteProvince,
  getRouteEffective,
  getRouteEffectiveAll,
  getAreaInRoute,
  getZoneInRoute,
  getRouteByArea,
  addFromERPnew,
  addFromERPOne,
  checkRouteStore,
  polylineRoute,
  addRouteIt,
  addStoreOneToRoute,
  getLatLongStore,
  updateRouteAllStore,
  addRadius,
  getRadius,
  addRouteByArea,
  reRouteIt,
  insertRouteToRouteChange,
  addStoreToRouteChange,
  deleteStoreToRouteChange,
  addRouteChangeToRoute,
  addTargetRoute,
  getRouteEffectiveByDayArea,
  getRouteChange,
  addNewStoreToRoute,
  approveNewStoreToRoute,
  getNewStoreToRouteDetail,
  getNewStoreToRoute,
  getAreaApproval,
  approveRouteChange,
  addOrderToRoute,
  getRouteSetting,

  getStoreCheckinByDayArea
} = require('../../controllers/route/routeController')

const {
  updateAreaByDataRoute,
  addRouteSettings,
  getRouteLock,
  editLockRoute
} = require('../../controllers/route/routeControllerV2')




const router = express.Router()

router.get('/getRoute', getRoute)
router.get('/getRadius', getRadius)
router.post('/checkIn', checkIn)
router.post('/checkInNotSale', checkInNotSale)
router.post('/addRadius', addRadius)
router.post('/checkInVisit', checkInVisit)
router.post('/checkInVisitNew', checkInVisitNew)
router.post('/addFromERP', addFromERP)
router.post('/change', changeRoute)
router.get('/history', routeHistory)
router.post('/createRoute', createRoute)
router.get('/getRouteCheckinAll', getRouteCheckinAll)
router.get('/getTimelineCheckin', getTimelineCheckin)
router.post('/routeTimeline', routeTimeline)
router.post('/updateAndAddRoute', updateAndAddRoute)
router.post('/getRouteProvince', getRouteProvince)
router.post('/getRouteEffective', getRouteEffective)
router.get('/getRouteEffectiveAll', getRouteEffectiveAll)
router.get('/getZone', getAreaInRoute)
router.get('/getArea', getZoneInRoute)
router.get('/getRouteByArea', getRouteByArea)
router.post('/addFromERPnew', addFromERPnew)
router.post('/addFromERPOne', addFromERPOne)
router.get('/checkRouteStore', checkRouteStore)
router.get('/polylineRoute', polylineRoute)
router.post('/addRouteIt', addRouteIt)
router.post('/addStoreOneToRoute', addStoreOneToRoute)
router.post('/getLatLongStore', getLatLongStore)
router.post('/updateRouteAllStore', updateRouteAllStore)
router.post('/addRouteByArea', addRouteByArea)
router.post('/reRouteIt', reRouteIt)
router.post('/insertRouteToRouteChange', insertRouteToRouteChange)
router.post('/addStoreToRouteChange', addStoreToRouteChange)
router.post('/deleteStoreToRouteChange', deleteStoreToRouteChange)
router.post('/addRouteChangeToRoute', addRouteChangeToRoute)
router.post('/addTargetRoute', addTargetRoute)
router.post('/getRouteEffectiveByDay', getRouteEffectiveByDayArea)

router.get('/getRouteChange', getRouteChange)
router.post('/addNewStoreToRoute', addNewStoreToRoute)
router.post('/approveNewStoreToRoute', approveNewStoreToRoute)
router.get('/getNewStoreToRouteDetail', getNewStoreToRouteDetail)
router.get('/getNewStoreToRoute', getNewStoreToRoute)
router.get('/getAreaApproval', getAreaApproval)
router.post('/approveRouteChange', approveRouteChange)
router.post('/addOrderToRoute', addOrderToRoute)
router.post('/getStoreCheckinByDayArea', getStoreCheckinByDayArea)
router.get('/getRouteSetting', getRouteSetting)
router.get('/getRouteLock', getRouteLock)

router.post('/updateAreaByDataRoute', updateAreaByDataRoute)
router.post('/addRouteSettings', addRouteSettings)
router.post('/editLockRoute', editLockRoute)
module.exports = router
