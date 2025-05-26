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
  getZoneInRoute
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
router.post('/getRouteEffectiveAll', getRouteEffectiveAll)
router.post('/getAreaInRoute', getAreaInRoute)
router.post('/getZoneInRoute', getZoneInRoute)





module.exports = router
