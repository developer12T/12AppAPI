const { getModelsByChannel } = require('../../middleware/channel')
const { uploadFiles } = require('../../utilities/upload')
const { getSocket } = require('../../socket')
const orderModel = require('../../models/cash/sale')
const refundModel = require('../../models/cash/refund')
const routeModel = require('../../models/cash/route')
const sendmoneyModel = require('../../models/cash/sendmoney')
const path = require('path')
const multer = require('multer')
const { replace } = require('lodash')
const upload = multer({ storage: multer.memoryStorage() }).array(
  'sendmoneyImage',
  1
)
const { period, previousPeriod } = require('../../utilities/datetime')
const { query } = require('mssql')
exports.addSendMoney = async (req, res) => {
  const channel = req.headers['x-channel']
  const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)
  const { area, date, sendmoney, salePayer, saleCode } = req.body

  const year = parseInt(date.slice(0, 4), 10)
  const month = parseInt(date.slice(4, 6), 10)
  const day = parseInt(date.slice(6, 8), 10)
  const dateObj = new Date(Date.UTC(year, month - 1, day - 1, 17, 0, 0))

  const existData = await SendMoney.aggregate([
    { $match: { area: area } },
    {
      $addFields: {
        thaiDate: {
          $dateAdd: {
            startDate: '$dateAt',
            unit: 'hour',
            amount: 7
          }
        }
      }
    },
    {
      $match: {
        $expr: {
          $and: [
            { $eq: [{ $year: '$thaiDate' }, year] },
            { $eq: [{ $month: '$thaiDate' }, month] },
            { $eq: [{ $dayOfMonth: '$thaiDate' }, day] }
          ]
        }
      }
    }
  ])

  // let sendmoneyData = {}

  // console.log(existData)

  if (existData.length == 0) {
    sendmoneyData = await SendMoney.create({
      area: area,
      dateAt: dateObj,
      sendmoney: sendmoney,
      salePayer: salePayer,
      saleCode: saleCode
    })
  } else {
    sendmoneyData = await SendMoney.findOneAndUpdate(
      { _id: existData[0]._id },
      {
        $inc: {
          sendmoney: +sendmoney
        },
        salePayer: salePayer,
        saleCode: saleCode
      }
    )
  }

  const io = getSocket()
  io.emit('sendmoney/addSendMoney', {
    status: 200,
    message: 'success'
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

      const year = parseInt(date.slice(0, 4), 10)
      const month = parseInt(date.slice(4, 6), 10)
      const day = parseInt(date.slice(6, 8), 10)
      const dateObj = new Date(Date.UTC(year, month - 1, day - 1, 17, 0, 0))

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
      const existData = await SendMoney.aggregate([
        { $match: { area: area } },
        {
          $addFields: {
            thaiDate: {
              $dateAdd: {
                startDate: '$createdAt',
                unit: 'hour',
                amount: 7
              }
            }
          }
        },
        {
          $match: {
            $expr: {
              $and: [
                { $eq: [{ $year: '$thaiDate' }, year] },
                { $eq: [{ $month: '$thaiDate' }, month] },
                { $eq: [{ $dayOfMonth: '$thaiDate' }, day] }
              ]
            }
          }
        }
      ])

      if (existData.length == 0) {
        return res.status(404).json({
          status: 404,
          message: 'Not found Sendmoney data'
        })
      }

      if (uploadedFiles.length > 0) {
        await SendMoney.updateOne(
          { _id: existData[0]._id },
          { $push: { imageList: { $each: uploadedFiles } } }
        )
      }

      const io = getSocket()
      io.emit('sendmoney/addSendMoneyImage', {
        status: '200',
        message: 'Sendmoney upload successfully'
      })

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
  try {
    const channel = req.headers['x-channel']
    const { area, date } = req.body

    if (!area || !date || date.length !== 8) {
      return res.status(400).json({
        message: 'Invalid request: area and date(YYYYMMDD) are required.'
      })
    }

    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)

    const thOffsetHours = 7
    const year = Number(date.substring(0, 4))
    const month = Number(date.substring(4, 6))
    const day = Number(date.substring(6, 8))

    const startOfDayTH = new Date(Date.UTC(year, month - 1, day, -7, 0, 0, 0)) // 00:00 TH
    const endOfDayTH = new Date(Date.UTC(year, month - 1, day, 16, 59, 59, 999)) // 23:59 TH

    // ✅ Fix เวลา UTC เป็น 10:00 ของวันนั้น และ 09:59:59.999 ของวันถัดไป
    const startOfDayUTC = new Date(startOfDayTH.getTime() - thOffsetHours)
    const endOfDayUTC = new Date(endOfDayTH.getTime() - thOffsetHours)

    console.log('🌐 startOfDayUTC:', startOfDayUTC.toISOString())
    console.log('🌐 endOfDayUTC:', endOfDayUTC.toISOString())

    const sumByType = async (Model, type) => {
      const result = await Model.aggregate([
        {
          $match: {
            type,
            'store.area': area,
            status: { $nin: ['canceled', 'delete'] },
            createdAt: { $gte: startOfDayUTC, $lte: endOfDayUTC }
          }
        },
        { $group: { _id: null, sendmoney: { $sum: '$total' } } }
      ])
      return result.length > 0 ? result[0].sendmoney : 0
    }

    const saleSum = await sumByType(Order, 'sale')
    const changeSum = await sumByType(Order, 'change')
    const refundSum = await sumByType(Refund, 'refund')

    // console.log(saleSum, changeSum, refundSum)

    const totalToSend = saleSum + (changeSum - refundSum)

    const alreadySentDocs = await SendMoney.aggregate([
      {
        $match: {
          area,
          dateAt: { $gte: startOfDayUTC, $lte: endOfDayUTC }
        }
      },
      {
        $group: {
          _id: null,
          totalSent: { $sum: '$sendmoney' }
        }
      }
    ])

    const alreadySent =
      alreadySentDocs.length > 0 ? alreadySentDocs[0].totalSent : 0
    const remaining = parseFloat((totalToSend - alreadySent).toFixed(2))

    await SendMoney.updateMany(
      {
        area,
        dateAt: { $gte: startOfDayUTC, $lte: endOfDayUTC }
      },
      { $set: { different: remaining } }
    )

    // แปลงกลับเป็นเวลาไทยเพื่อส่งออก
    const toThaiTime = utcDate =>
      new Date(utcDate.getTime() + thOffsetHours * 60 * 60 * 1000)

    res.status(200).json({
      message: 'success',
      summary: totalToSend,
      sendmoney: alreadySent,
      different: remaining,
      status: alreadySent > 0 ? 'ส่งเงินแล้ว' : 'ยังไม่ส่งเงิน',
      dateRangeThai: {
        start: startOfDayUTC,
        end: endOfDayUTC
      }
    })
  } catch (err) {
    console.error('[getSendMoney Error]', err)
    res
      .status(500)
      .json({ message: 'Internal Server Error', error: err.message })
  }
}

exports.getAllSendMoney = async (req, res) => {
  const channel = req.headers['x-channel']
  const { area, zone } = req.query
  const { Order } = getModelsByChannel(channel, res, orderModel)
  const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)
  let pipeline = []
  pipeline.push({
    $addFields: {
      zone: { $substrBytes: ['$area', 0, 2] }
    }
  })

  let matchStage = {}

  if (area) {
    matchStage.area = area
  }
  if (zone) {
    matchStage.zone = zone
  }

  if (Object.keys(matchStage).length > 0) {
    pipeline.push({ $match: matchStage })
  }

  const sendMoneyData = await SendMoney.aggregate(pipeline)

  // const io = getSocket()
  // io.emit('sendmoney/getAllSendMoney', {});

  res.status(200).json({
    status: 200,
    message: 'success',
    data: sendMoneyData
  })
}

exports.getSendMoneyForAcc = async (req, res) => {
  try {
    const { date, area, zone } = req.query
    const channel = req.headers['x-channel']

    if (!date) {
      return res
        .status(400)
        .json({ status: 400, message: 'Missing date parameter' })
    }

    const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)

    const year = Number(date.slice(0, 4))
    const month = Number(date.slice(5, 7))
    const day = Number(date.slice(8, 10))

    // ✅ เวลาไทย -> แปลงเป็น UTC
    const start = new Date(Date.UTC(year, month - 1, day - 1, 17, 0, 0, 0)) // 00:00 TH
    const end = new Date(Date.UTC(year, month - 1, day, 16, 59, 59, 999)) // 23:59:59 TH

    const matchStage = {
      dateAt: { $gte: start, $lte: end }
    }

    if (area) {
      matchStage.area = area
    } else if (zone) {
      matchStage.$expr = {
        $eq: [{ $substrBytes: ['$area', 0, 2] }, zone]
      }
    }

    const data = await SendMoney.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'users',
          localField: 'saleCode',
          foreignField: 'saleCode',
          as: 'user'
        }
      },
      {
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 0,
          area: '$area',
          sale: '$user.firstName',
          STATUS: 'รอตรวจสอบ',
          TRANSFER_DATE: date,
          VALUES: '$sendmoney',
          ZONE: { $substrBytes: ['$area', 0, 2] }
        }
      },
      {
        $group: {
          _id: {
            area: '$area',
            sale: '$sale',
            STATUS: '$STATUS',
            TRANSFER_DATE: '$TRANSFER_DATE',
            ZONE: '$ZONE'
          },
          VALUES: { $sum: '$VALUES' },
          COUNT: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          AREA: '$_id.area',
          ZONE: '$_id.ZONE',
          SALE: '$_id.sale',
          STATUS: '$_id.STATUS',
          TRANSFER_DATE: '$_id.TRANSFER_DATE',
          VALUES: { $toString: '$VALUES' }, // แปลง VALUES เป็น string
          COUNT: { $toString: '$COUNT' } // แปลง COUNT เป็น string
        }
      }
    ])

    res.status(200).json({
      status: 200,
      message: 'success',
      data
    })
  } catch (err) {
    console.error('[getSendMoneyForAcc] ❌', err)
    res.status(500).json({
      status: 500,
      message: err.message || 'Internal server error'
    })
  }
}
