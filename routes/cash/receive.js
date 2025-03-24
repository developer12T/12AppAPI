const express = require('express')
const { addReceive } = require('../../controllers/distribution/receiveController')

const router = express.Router()

router.post('/add', addReceive)

module.exports = router