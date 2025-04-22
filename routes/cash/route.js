const express = require('express')
const {
  getRoute,
  addFromERP,
  checkIn,
  changeRoute,
  routeHistory,
  createRoute,
  getRouteCheckinAll,
  geTimelineCheckin,
  checkInVisit,
  routeTimeline
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
router.get('/geTimelineCheckin', geTimelineCheckin)
router.post('/routeTimeline', routeTimeline)



module.exports = router
