const express = require('express')

const {
  addSendMoney,
  addSendMoneyImage,
  getSendMoney,
  getAllSendMoney,
  getSendMoneyForAcc,
  sendmoneyToExcel,
  updateSendmoneyOld,
  updateSendmoneyOld2,
  fixSendmoney
} = require('../../controllers/sendmoney/sendmoneyController')

const multer = require('multer')
const path = require('path')
const storage = multer.diskStorage({
  destination: 'public/manual/',
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `Manual${ext}`)
  }
})
// const upload = multer({ storage });

const upload = multer({
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel'
    ) {
      cb(null, true)
    } else {
      cb(new Error('Only Excel files allowed!'), false)
    }
  }
})

const router = express.Router()
router.post('/addSendMoney', addSendMoney)
router.post('/addSendMoneyImage', addSendMoneyImage)
router.post('/getSendMoney', getSendMoney)
router.get('/getAllSendMoney', getAllSendMoney)
router.get('/getSendMoneyForAcc', getSendMoneyForAcc)
router.get('/sendmoneyToExcel', sendmoneyToExcel)
router.get('/sendmoneyToExcel', sendmoneyToExcel)
router.post('/fixSendmoney', upload.single('file'), fixSendmoney)
module.exports = router
