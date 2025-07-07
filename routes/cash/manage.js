const express = require('express')
const { addOption, getOption } = require('../../controllers/manage/optionController')

const router = express.Router()

router.post('/option/add', addOption)
router.get('/option/get', getOption)

module.exports = router