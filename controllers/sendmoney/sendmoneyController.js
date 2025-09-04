const { getModelsByChannel } = require('../../middleware/channel')
const { uploadFiles } = require('../../utilities/upload')
const { getSocket } = require('../../socket')
const orderModel = require('../../models/cash/sale')
const refundModel = require('../../models/cash/refund')
const routeModel = require('../../models/cash/route')
const userModel = require('../../models/cash/user')
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

    const sumByTypeChangeRefund = async (Model, type) => {
      const result = await Model.aggregate([
        {
          $match: {
            type,
            'store.area': area,
            status: { $nin: ['pending','canceled', 'delete'] },
            createdAt: { $gte: startOfDayUTC, $lte: endOfDayUTC }
          }
        },
        { $group: { _id: null, sendmoney: { $sum: '$total' } } }
      ])
      return result.length > 0 ? result[0].sendmoney : 0
    }




    const saleSum = await sumByType(Order, 'sale')
    const changeSum = await sumByTypeChangeRefund(Order, 'change')
    const refundSum = await sumByTypeChangeRefund(Refund, 'refund')

    // console.log(saleSum, changeSum, refundSum)

    const totalToSend = saleSum + (changeSum - refundSum)
    const alreadySentDocs = await SendMoney.aggregate([
      {
        $match: {
          area,
          dateAt: { $gte: startOfDayUTC, $lte: endOfDayUTC }
        }
      },
      { $unwind: '$imageList' }, // ดึงแต่ละรูปออกมา
      {
        $group: {
          _id: '$imageList.path',      // ✅ ใช้ path เป็น _id
          totalSent: { $sum: '$sendmoney' },
          count: { $sum: 1 }           // นับจำนวนรูป/เอกสารต่อ path (เผื่ออยากดู)
        }
      },
      { $project: { _id: 0, path: '$_id', totalSent: 1, count: 1 } }, // แปลงให้อ่านง่าย
      { $sort: { path: 1 } }
    ]);

    // console.log(alreadySentDocs)


    const image = alreadySentDocs.map(item => {
      return {
        path:item.path
      }
    })

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
      },
      image:image
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
    const { date, area, zone, channel } = req.query
    // const channel = req.headers['x-channel']

    if (!date) {
      return res
        .status(400)
        .json({ status: 400, message: 'Missing date parameter' })
    }

    const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)
    const { User } = getModelsByChannel(channel, res, userModel)

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

    // 1. Count user by area (เก็บเป็น object)
    const totalUserCountArr = await User.aggregate([
      {
        $match: {
          area: { $nin: [null, '', 'IT211'] }
        }
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 }
        }
      }
    ])
    const totalUserCount = totalUserCountArr[0]?.count || 0

    const data = await SendMoney.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'users',
          localField: 'area',
          foreignField: 'area',
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
          SALE: { $concat: ['$user.firstName', ' ', '$user.surName'] },
          // STATUS: 'OK',
          TRANSFER_DATE: date,
          WAREHOUSE: '$user.warehouse',
          VALUES: '$sendmoney',
          ZONE: { $substrBytes: ['$area', 0, 2] },
          IMAGE: {
            $concat: [
              'https://apps.onetwotrading.co.th/images/sendmoney/',
              { $ifNull: ['$user.area', ''] },
              '/',
              {
                $trim: {
                  // trims the trailing comma you have in the sample
                  input: {
                    $ifNull: [{ $arrayElemAt: ['$imageList.name', 0] }, '']
                  },
                  chars: ','
                }
              }
            ]
          }
        }
      },
      {
        $group: {
          _id: {
            area: '$area',
            SALE: '$SALE',
            // STATUS: '$STATUS',
            TRANSFER_DATE: '$TRANSFER_DATE',
            ZONE: '$ZONE',
            IMAGE: '$IMAGE',
            WAREHOUSE: '$WAREHOUSE'
          },
          VALUES: { $sum: '$VALUES' },
          COUNT: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          AREA: '$_id.area',
          COUNT: { $toString: '$COUNT' },
          SALE: '$_id.SALE',
          STATUS: { $cond: [{ $eq: ['$VALUES', 0] }, 'NOT OK', 'OK'] },
          TRANSFER_DATE: '$_id.TRANSFER_DATE',
          VALUES: {
            $cond: [
              { $eq: ['$VALUES', null] },
              '0.00',
              { $toString: { $round: ['$VALUES', 2] } }
            ]
          },
          ZONE: '$_id.ZONE',
          IMAGE: '$_id.IMAGE',
          WAREHOUSE: '$_id.WAREHOUSE'
        }
      }
    ])

    const formatted = data.map(item => ({
      ...item,
      COUNT: `${totalUserCount}`,
      VALUES: Number(item.VALUES).toFixed(2)
    }))
    // console.log(formatted)

    // res.setHeader(
    //   'Content-Disposition',
    //   `attachment; filename="sendmoney_${date}.json"`
    // )
    // res.setHeader('Content-Type', 'application/json; charset=utf-8')
    // res.send(JSON.stringify({ formatted }, null, 2)) // pretty format
    res.status(200).json(formatted)
  } catch (err) {
    console.error('[getSendMoneyForAcc] ❌', err)
    res.status(500).json({
      status: 500,
      message: err.message || 'Internal server error'
    })
  }
}
