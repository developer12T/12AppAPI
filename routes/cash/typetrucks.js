const express = require('express')


const {
utilize
} = require('../../controllers/typetruck/typetruckController')
const router = express.Router()
router.post('/utilize', utilize)



module.exports = router