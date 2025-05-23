const { getModelsByChannel } = require('../../middleware/channel')
const { uploadFiles } = require('../../utilities/upload')
const orderModel = require('../../models/cash/sale')
const routeModel = require('../../models/cash/route')
const sendmoneyModel = require('../../models/cash/sendmoney')
const path = require('path')
const multer = require('multer')
const upload = multer({ storage: multer.memoryStorage() }).array(
  'sendmoneyImage',
  1
)

exports.addSendMoney = async (req, res) => {
  const channel = req.headers['x-channel']
  const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)
  const { area, date, sendmoney } = req.body

  const year = parseInt(date.slice(0, 4), 10)
  const month = parseInt(date.slice(4, 6), 10) - 1
  const day = parseInt(date.slice(6, 8), 10)

  const dateObj = new Date(year, month, day)

  const sendmoneyData = await SendMoney.create({
    area: area,
    date: dateObj,
    sendmoney: sendmoney
  })

  res.status(200).json({
    status: 200,
    message: 'success'
  })
}

exports.addSendMoneyImage = async (req, res) => {
  const channel = req.headers['x-channel']
  upload(req, res, async err => {
    if (err) {
      return res.status(400).json({ status: '400', message: err.message })
    }
    try {
      if (!req.body.area) {
        return res.status(400).json({
          status: '400',
          message: 'Area ID is required'
        })
      }
      const files = req.files
      const area = req.body.area
      const date = req.body.date

      const uploadedFiles = []
      for (let i = 0; i < files.length; i++) {
        const uploadedFile = await uploadFiles(
          [files[i]],
          path.join(__dirname, '../../public/images/sendmoney'),
          area,
          area
        )
        uploadedFiles.push({
          name: uploadedFile[0].name,
          path: uploadedFile[0].fullPath
        })
      }

      const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)
      const sendMoney = await SendMoney.findOne({ date: date })

      const rawDate = '20250523'
      const year = parseInt(rawDate.slice(0, 4))
      const month = parseInt(rawDate.slice(4, 6)) - 1
      const day = parseInt(rawDate.slice(6, 8))

      // Create date that matches 00:00 in Thailand (UTC+7)
      const dateObj = new Date(Date.UTC(year, month, day - 1, 17, 0, 0)) // 17:00 UTC = next day 00:00 in Bangkok

      if (uploadedFiles.length > 0) {
        await SendMoney.updateOne(
          { date: dateObj },
          { $push: { imageList: { $each: uploadedFiles } } }
        )
      }
      res.status(200).json({
        status: '200',
        message: 'Sendmoney upload successfully'
      })
    } catch (error) {
      console.error('Error saving store to MongoDB:', error)
      res.status(500).json({ status: '500', message: 'Server Error' })
    }
  })
}

exports.getSendMoney = async (req, res) => {
  const channel = req.headers['x-channel']
  const { area, date, sendmoney } = req.body
  const { Route } = getModelsByChannel(channel, res, routeModel)

  const routeData = await Route.aggregate([
    {
      $match: {
        area: area
      }
    },
    { $unwind: { path: '$listStore', preserveNullAndEmptyArrays: true } },
    {
      $match: {
        listStore: area
      }
    }
  ])

  res.status(200).json({
    status: 200,
    message: 'success',
    data: routeData
  })
}
