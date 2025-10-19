const express = require('express')


const {
    addNoodleItem,
    getNoodleItem
} = require('../../controllers/noodle/noodleItemsController')


const router = express.Router()


router.post('/addNoodleItem', addNoodleItem)
router.get('/getNoodleItem', getNoodleItem)
module.exports = router