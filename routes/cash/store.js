const express = require('express')
const { getStore, addStore, editStore, checkInStore, addFromERP } = require('../../controllers/store/storeController')

const router = express.Router()

router.get('/getStore', getStore)
router.post('/addStore', addStore)
router.post('/addFromERP', addFromERP)
router.patch('/editStore/:storeId', editStore)
router.post('/checkIn/:storeId', checkInStore)

module.exports = router