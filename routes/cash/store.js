const express = require('express')
const {
  getStore,
  addStore,
  editStore,
  checkInStore,
  addFromERP,
  updateStoreStatus,
  rejectStore,
  addAndUpdateStore
} = require('../../controllers/store/storeController')

const router = express.Router()

router.get('/getStore', getStore)
router.post('/addStore', addStore)
router.post('/addFromERP', addFromERP)
router.patch('/editStore/:storeId', editStore)
router.post('/checkIn/:storeId', checkInStore)
router.post('/updateStoreStatus', updateStoreStatus)
router.post('/rejectStore', rejectStore)
router.post('/addAndUpdateStore', addAndUpdateStore)

module.exports = router
