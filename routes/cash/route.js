const express = require('express')
const {
  getRoute,
  addFromERP,
  checkIn,
  changeRoute,
  routeHistory,
  createRoute,
  getRouteCheckinAll,
  getTimelineCheckin,
  checkInVisit,
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
  getLatLongStore
} = require('../../controllers/route/routeController')

const router = express.Router()

router.get('/getRoute', getRoute)
router.post('/checkIn', checkIn)
router.post('/checkInVisit', checkInVisit)
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
module.exports = router
