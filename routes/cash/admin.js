const express = require('express')
const {
  reportCheck,
  reportCheckExcel,
  createPowerPoint
} = require('../../controllers/admin/adminController')

const multer = require('multer')
const path = require('path')

// const storage = multer.diskStorage({
//   destination: 'public/manual/',
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname)
//     cb(null, `Manual${ext}`)
//   }
// })

const storage = multer.diskStorage({
  destination: 'public/manual/',
  filename: (req, file, cb) => {
    cb(null, file.originalname) // ✅ ใช้ชื่อไฟล์จริง
  }
})

const upload = multer({ storage })
const router = express.Router()

router.get('/reportCheck', reportCheck)
router.get('/reportCheckExcel', reportCheckExcel)
router.post('/createPowerPoint', upload.single('powerPoint'), createPowerPoint)

module.exports = router
