const express = require('express')
const {
  getRoute,
  addFromERP,
  checkIn,
  changeRoute,
  routeHistory,
  createRoute,
  getRouteCheckinAll,
  geTimelineCheckin
} = require('../../controllers/route/routeController')

const router = express.Router()

router.get('/getRoute', getRoute)
router.post('/checkIn', checkIn)
router.post('/addFromERP', addFromERP)
router.post('/change', changeRoute)
router.get('/history', routeHistory)
router.post('/createRoute', createRoute)
router.get('/getRouteCheckinAll', getRouteCheckinAll)
router.get('/geTimelineCheckin', geTimelineCheckin)

module.exports = router
