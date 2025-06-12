const express = require('express')
const {
  getProductAll,
  getProduct,
  searchProduct,
  getFilters,
  updateStatus,
  addFromERP,
  getProductSwitch,
  addFromERPnew,
  groupProductId
} = require('../../controllers/product/productController')

const router = express.Router()

router.get('/all', getProductAll)
router.post('/get', getProduct)
router.get('/getProductSwitch', getProductSwitch)
router.get('/search', searchProduct)
router.post('/filter', getFilters)
router.post('/onOff', updateStatus)
router.post('/addFromERP', addFromERP)
router.post('/addFromERPnew', addFromERPnew)
router.get('/groupProductId', groupProductId)


// router.get('/searchProduct', searchProduct)
module.exports = router
