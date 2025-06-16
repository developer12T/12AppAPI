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
  const month = parseInt(date.slice(4, 6), 10)
  const day = parseInt(date.slice(6, 8), 10)
  const dateObj = new Date(Date.UTC(year, month - 1, day - 1, 17, 0, 0))

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
  let sendmoneyData = {}
  if (existData.length == 0) {
    sendmoneyData = await SendMoney.create({
      area: area,
      date: dateObj,
      sendmoney: sendmoney
    })
  } else {
    sendmoneyData = await SendMoney.findOneAndUpdate(
      { _id: existData[0]._id },
      {
        $inc: {
          sendmoney: +sendmoney
        }
      }
    )
  }

  // const sendmoneyData = await SendMoney.create({
  //   area: area,
  //   date: dateObj,
  //   sendmoney: sendmoney
  // })

  res.status(200).json({
    status: 200,
    message: 'success',
    data: dateObj
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
    const { area } = req.body

    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)

    // วันไทย (UTC+7)
    const now = new Date()
    const thaiNow = new Date(now.getTime() + 7 * 60 * 60 * 1000)
    const year = thaiNow.getFullYear()
    const month = thaiNow.getMonth() + 1
    const day = thaiNow.getDate()

    // Step 1: คำนวณยอดที่ควรส่งวันนี้ (เหมือน getSummarybyChoice type = day)
    const orders = await Order.aggregate([
      {
        $addFields: {
          createdAtThai: {
            $dateAdd: {
              startDate: '$createdAt',
              unit: 'hour',
              amount: 7
            }
          }
        }
      },
      {
        $addFields: {
          day: { $dayOfMonth: '$createdAtThai' },
          month: { $month: '$createdAtThai' },
          year: { $year: '$createdAtThai' }
        }
      },
      {
        $match: {
          'store.area': area,
          status: 'pending',
          day,
          month,
          year
        }
      },
      {
        $group: {
          _id: null,
          sendmoney: { $sum: '$total' }
        }
      }
    ])

    const totalToSend = orders.length > 0 ? orders[0].sendmoney : 0

    // Step 2: หายอดที่เคยส่งในวันนี้จาก collection sendmoney
    const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
    const endOfDay = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0))
    const alreadySentDocs = await SendMoney.aggregate([
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
          area: area,
          $expr: {
            $and: [
              { $eq: [{ $dayOfMonth: '$thaiDate' }, day] },
              { $eq: [{ $month: '$thaiDate' }, month] },
              { $eq: [{ $year: '$thaiDate' }, year] }
            ]
          }
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

    res.status(200).json({
      message: 'success',
      totalToSend,
      alreadySent,
      sendmoney: remaining,
      status: remaining <= 0 ? 'ส่งเงินครบ' : 'ยังส่งเงินไม่ครบ'
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
  console.log(area, zone)
  const { Order } = getModelsByChannel(channel, res, orderModel)
  const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)
  let pipeline = [];
  pipeline.push({
    $addFields: {
      zone: { $substrBytes: ["$area", 0, 2] }
    }
  });

  let matchStage = {};

  if (area) {
    matchStage.area = area;
  }
  if (zone) {
    matchStage.zone = zone;
  }

  if (Object.keys(matchStage).length > 0) {
    pipeline.push({ $match: matchStage });
  }

  const sendMoneyData = await SendMoney.aggregate(pipeline);

  res.status(200).json({
    status: 200,
    message: 'success',
    data: sendMoneyData
  })

}