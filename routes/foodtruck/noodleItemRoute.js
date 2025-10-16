const express = require('express')


const {
    addNoodleItem,
    getNoodleItem
} = require('../../controllers/noodleItem/noodleItemsController')


const router = express.Router()


router.post('/addNoodleItem', addNoodleItem)
router.get('/getNoodleItem', getNoodleItem)
module.exports = router