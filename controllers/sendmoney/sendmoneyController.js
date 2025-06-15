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
  const channel = req.headers['x-channel']
  const { area } = req.body
  const { Route } = getModelsByChannel(channel, res, routeModel)
  const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)
  const now = new Date()
  const period = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
    2,
    '0'
  )}${String(now.getDate()).padStart(2, '0')}`
  const year = Number(period.slice(0, 4))
  const month = Number(period.slice(4, 6))
  const day = Number(period.slice(6, 8))

  // เวลาเริ่มและจบของวันที่ต้องการในเขตเวลาไทย (UTC+7)
  const startDate = new Date(Date.UTC(year, month, day - 1, 17, 0, 0)) // 00:00 +07
  const endDate = new Date(Date.UTC(year, month, day, 17, 0, 0)) // 00:00 +07 ของวันถัดไป

  const routeData = await Route.aggregate([
    { $match: { area: area } },
    { $unwind: { path: '$listStore', preserveNullAndEmptyArrays: true } },
    {
      $unwind: {
        path: '$listStore.listOrder',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $match: {
        'listStore.listOrder': { $ne: null }
      }
    },
    {
      $addFields: {
        thaiDate: {
          $dateAdd: {
            startDate: '$listStore.listOrder.date',
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
            { $eq: [{ $month: '$thaiDate' }, month] }
          ]
        }
      }
    },
    {
      $project: {
        _id: 0,
        'listStore.listOrder': 1
      }
    },
    {
      $lookup: {
        from: 'orders',
        localField: 'listStore.listOrder.orderId',
        foreignField: 'orderId',
        as: 'order'
      }
    },
    {
      $unwind: {
        path: '$order',
        preserveNullAndEmptyArrays: false
      }
    },
    {
      $match: {
        'order.status': 'pending'
      }
    },
    {
      $group: {
        _id: null,
        sendmoney: { $sum: '$order.total' }
      }
    },
    {
      $project: {
        _id: 0,
        sendmoney: 1,
        status: 'ยังไม่ได้ส่งเงิน'
      }
    }
  ])

  let data = {}

  if (routeData.length == 0) {
    data = {
      sendmoney: 0,
      status: 'ยังไม่ได้ส่งเงิน'
    }
  } else {
    data = routeData[0]
  }

  const sendMoney = await SendMoney.aggregate([
    {
      $match: {
        area: area
      }
    },
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
        'sendmoney.createdAt': { $gte: startDate, $lt: endDate }
        // $expr: {
        //   $and: [

        //     // { $eq: [{ $year: '$thaiDate' }, year] },
        //     // { $eq: [{ $month: '$thaiDate' }, month] },
        //     // { $eq: [{ $dayOfMonth: '$thaiDate' }, day] }
        //   ]
        // }
      }
    },
    {
      $group: {
        _id: '$area',
        sendmoney: { $sum: '$sendmoney' }
      }
    }
  ])

  let checksendMoney = 0

  if (sendMoney.length > 0) {
    checksendMoney = sendMoney[0].sendmoney
  }

  let status = ''

  const calSendMoney = data.sendmoney - checksendMoney
  if (calSendMoney == 0) {
    status = 'ส่งเงินครบ'
  } else {
    status = 'ยังส่งเงินไม่ครบ'
  }
  res.status(200).json({
    // status:200,
    message: 'success',
    sendmoney: calSendMoney,
    status: status
  })
}
