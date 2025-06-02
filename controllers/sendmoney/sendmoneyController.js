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

  const channel = req.headers['x-channel'];
  const { area, date } = req.body
  const { Route } = getModelsByChannel(channel, res, routeModel);

  const year = parseInt(date.toString().slice(0, 4), 10);
  const month = parseInt(date.toString().slice(4, 6), 10);
  const day = parseInt(date.toString().slice(6, 8), 10);


  const startDate = new Date(Date.UTC(year, month - 1, day - 1, 17, 0, 0));
  const endDate = new Date(Date.UTC(year, month - 1, day, 17, 0, 0));

  const fullMonth = month.toString().padStart(2, '0');
  const period = `${year}${fullMonth}`



  // console.log(startDate)
  // console.log(endDate)
  const routeData = await Route.aggregate([
    { $match: { area: area, period: period } },
    { $unwind: { path: '$listStore', preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$listStore.listOrder', preserveNullAndEmptyArrays: true } },
    {
      $match: {
        'listStore.listOrder': { $ne: null }
      }
    },
    {
      $addFields: {
        thaiDate: {
          $dateAdd: {
            startDate: "$listStore.listOrder.date",
            unit: "hour",
            amount: 7
          }
        }
      }
    },
    {
      $match: {
        thaiDate: {
          $gte: startDate,
          $lt: endDate
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
        path: "$order",
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
        sendmoney: { $sum: "$order.total" }
      }
    },
    {
      $project: {
        _id: 0,
        sendmoney: 1,
        status: 'ยังไม่ได้ส่งเงิน'
      }
    }
  ]);

  let data = {}

  if (routeData.length == 0) {
    data = {
      sendmoney: 0,
      status: 'ยังไม่ได้ส่งเงิน'
    };
  }
  else {
    data = routeData[0];
  }



  console.log(JSON.stringify(data, null, 2));
  res.status(200).json({
    // status:200,
    message: "success",
    sendmoney: data.sendmoney,
    status: data.status
  })
}