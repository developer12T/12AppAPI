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
  updateAndAddRoute
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



module.exports = router
