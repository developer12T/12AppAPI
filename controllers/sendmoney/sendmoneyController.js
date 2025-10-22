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
const xlsx = require('xlsx')
const os = require('os')
const fs = require('fs')
const { replace } = require('lodash')
const upload = multer({ storage: multer.memoryStorage() }).array(
  'sendmoneyImage',
  1
)
const {
  dataUpdateSendMoney,
  dataUpdateTotalSale
} = require('../../controllers/queryFromM3/querySctipt')
const {
  to2,
  updateStockMongo,
  generateDateList
} = require('../../middleware/order')
const { period, previousPeriod } = require('../../utilities/datetime')
const { query } = require('mssql')
const { Item } = require('../../models/cash/master')
const sendmoney = require('../../models/cash/sendmoney')

exports.addSendMoney = async (req, res) => {
  const channel = req.headers['x-channel']
  const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)
  const { Order } = getModelsByChannel(channel, res, orderModel)
  const { Refund } = getModelsByChannel(channel, res, refundModel)
  const { area, date, sendmoney, salePayer, saleCode } = req.body

  const year = parseInt(date.slice(0, 4), 10)
  const month = parseInt(date.slice(4, 6), 10)
  const day = parseInt(date.slice(6, 8), 10)
  const startOfMonthUTC = new Date(Date.UTC(year, month - 1, day - 1, 17, 0, 0))
  const endOfMonthUTC = new Date(
    Date.UTC(year, month - 1, day, 16, 59, 59, 999)
  )

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

  const periodStr = period()

  const [dataRefund, dataOrderSale, dataOrderChange] = await Promise.all([
    Refund.find({
      'store.area': area,
      period: periodStr,
      createdAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
      type: 'refund',
      status: { $nin: ['pending', 'canceled', 'reject'] }
    }),
    Order.find({
      'store.area': area,
      period: periodStr,
      createdAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
      type: 'sale',
      status: { $nin: ['canceled', 'reject'] }
    }),
    Order.find({
      'store.area': area,
      period: periodStr,
      createdAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
      type: 'change',
      status: { $nin: ['pending', 'canceled', 'reject'] }
    })
  ])

  const refundSum = dataRefund.reduce((sum, item) => {
    return sum + item.total
  }, 0)

  const saleSum = dataOrderSale.reduce((sum, item) => {
    return sum + item.total
  }, 0)

  const changeSum = dataOrderChange.reduce((sum, item) => {
    return sum + item.total
  }, 0)

  const sumTotalSale = saleSum + (changeSum - refundSum)

  if (existData.length == 0) {
    const different = sendmoney - sumTotalSale
    sendmoneyData = await SendMoney.create({
      area: area,
      dateAt: startOfMonthUTC,
      sendmoney: sendmoney,
      salePayer: salePayer,
      saleCode: saleCode,
      period: periodStr,
      different: to2(different)
    })
  } else {
    const different = existData[0].sendmoney + sendmoney - sumTotalSale
    sendmoneyData = await SendMoney.findOneAndUpdate(
      { _id: existData[0]._id },
      {
        $inc: {
          sendmoney: +sendmoney
        },
        salePayer: salePayer,
        saleCode: saleCode,
        different: to2(different)
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
            status: { $nin: ['pending', 'canceled', 'delete'] },
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
          _id: '$imageList.path', // ✅ ใช้ path เป็น _id
          totalSent: { $sum: '$sendmoney' },
          count: { $sum: 1 } // นับจำนวนรูป/เอกสารต่อ path (เผื่ออยากดู)
        }
      },
      { $project: { _id: 0, path: '$_id', totalSent: 1, count: 1 } }, // แปลงให้อ่านง่าย
      { $sort: { path: 1 } }
    ])

    // console.log(alreadySentDocs)

    const image = alreadySentDocs.map(item => {
      return {
        path: item.path
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
      image: image
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

exports.updateSendmoneyOld = async (req, res) => {
  try {
    const { area } = req.body
    const channel = req.headers['x-channel']
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { User } = getModelsByChannel(channel, res, userModel)

    // รับ period และคำนวณปี เดือน
    const periodStr = period()
    const year = Number(periodStr.substring(0, 4))
    const month = Number(periodStr.substring(4, 6))

    // หาช่วงเวลา UTC ของเดือนที่ต้องการ (แปลงจากเวลาไทย)
    const thOffset = 7 * 60 * 60 * 1000
    const startOfMonthTH = new Date(year, month - 1, 1, 0, 0, 0, 0)
    const endOfMonthTH = new Date(year, month, 0, 23, 59, 59, 999)
    const startOfMonthUTC = new Date(startOfMonthTH.getTime() - thOffset)
    const endOfMonthUTC = new Date(endOfMonthTH.getTime() - thOffset)

    // ฟังก์ชันสำหรับแปลงวันที่เป็น dd/mm/yyyy ตามเวลาไทย
    const getDateStrTH = dateUTC => {
      const dateTH = new Date(new Date(dateUTC).getTime() + thOffset)
      const day = dateTH.getDate().toString().padStart(2, '0')
      const mon = (dateTH.getMonth() + 1).toString().padStart(2, '0')
      const yr = dateTH.getFullYear()
      return `${yr}-${mon}-${day}`
    }

    const [dataSendmoney, dataRefund, dataOrderSale, dataOrderChange] =
      await Promise.all([
        // SendMoney.find({
        //   area: area,
        //   dateAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
        // }),
        SendMoney.aggregate([
          {
            $match: {
              area: area,
              dateAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC }
            }
          },
          {
            $addFields: {
              createdAt: '$dateAt'
            }
          }
        ]),
        Refund.find({
          'store.area': area,
          period: periodStr,
          createdAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
          type: 'refund',
          status: { $nin: ['pending', 'canceled', 'reject'] }
        }),
        Order.find({
          'store.area': area,
          period: periodStr,
          createdAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
          type: 'sale',
          status: { $nin: ['canceled', 'reject'] }
        }),
        Order.find({
          'store.area': area,
          period: periodStr,
          createdAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
          type: 'change',
          status: { $nin: ['pending', 'canceled', 'reject'] }
        })
      ])

    // รวม summary และ status ต่อวันจาก sendmoney
    const sumByDate = dataSendmoney.reduce((acc, item) => {
      const dateStr = getDateStrTH(item.createdAt)
      if (!acc[dateStr]) {
        acc[dateStr] = { summary: 0, status: item.status || '' }
      }
      acc[dateStr].summary += item.sendmoney || 0
      // acc[dateStr].status = item.status; // ถ้าอยากใช้ status อันสุดท้ายในวันนั้น
      return acc
    }, {})

    // ทำให้ array พร้อม map สำหรับ summary กับ status
    const dataSendMoneyTran = Object.entries(sumByDate).map(([date, val]) => ({
      date,
      summary: val.summary,
      status: val.status
    }))
    // console.log(dataSendMoneyTran)
    const sendMoneyMap = Object.fromEntries(
      dataSendMoneyTran.map(d => [d.date, d.summary])
    )
    const statusMap = Object.fromEntries(
      dataSendMoneyTran.map(d => [d.date, d.status])
    )

    // สร้างรายการ refund แบบแบน
    const refundListFlat = dataRefund.flatMap(item =>
      item.listProduct.map(u => ({
        price: u.total,
        condition: u.condition,
        date: getDateStrTH(item.createdAt)
      }))
    )
    const refundByDate = refundListFlat.reduce((acc, r) => {
      if (!acc[r.date]) acc[r.date] = []
      acc[r.date].push(r)
      return acc
    }, {})

    const orderSaleListFlat = dataOrderSale.flatMap(item =>
      item.listProduct.map(u => ({
        price: u.netTotal,
        date: getDateStrTH(item.createdAt)
      }))
    )

    const orderChangeListFlat = dataOrderChange.flatMap(item =>
      item.listProduct.map(u => ({
        price: u.netTotal,
        date: getDateStrTH(item.createdAt)
      }))
    )

    // Group by date
    const saleByDate = orderSaleListFlat.reduce((acc, o) => {
      acc[o.date] = (acc[o.date] || 0) + Number(o.price || 0)
      return acc
    }, {})

    const changeByDate = orderChangeListFlat.reduce((acc, o) => {
      acc[o.date] = (acc[o.date] || 0) + Number(o.price || 0)
      return acc
    }, {})

    // เตรียม array วันที่ครบทั้งเดือน
    const lastDay = new Date(year, month, 0).getDate()
    const allDateArr = Array.from(
      { length: lastDay },
      (_, i) =>
        `${year}-${month.toString().padStart(2, '0')}-${(i + 1)
          .toString()
          .padStart(2, '0')}`
    )

    const user = await User.findOne({ area })

    // สร้างผลลัพธ์รายวัน (ใส่ 0 ถ้าไม่มีข้อมูล)
    const fullMonthArr = allDateArr.map(date => {
      const sendmoneyRaw = sendMoneyMap[date] || 0
      const sendmoney = to2(sendmoneyRaw)
      let status = ''
      const refundTodayRaw = refundByDate[date] || []
      const refundToday = refundTodayRaw
      const goodRaw = refundToday
        .filter(x => x.condition === 'good')
        .reduce((sum, x) => sum + Number(x.price), 0)
      const good = to2(goodRaw)
      const damagedRaw = refundToday
        .filter(x => x.condition === 'damaged')
        .reduce((sum, x) => sum + Number(x.price), 0)
      const damaged = to2(damagedRaw)
      // เพิ่ม sale และ change
      const summaryRaw = saleByDate[date] || 0

      const changeRaw = changeByDate[date] || 0
      const change = to2(changeRaw)
      const diffChange = to2(change - damaged - good)

      const summary = to2(summaryRaw + diffChange)
      const diffRaw = sendmoney - summary
      const diff = to2(diffRaw)
      if (sendmoney > 0) {
        status = 'ส่งเงินแล้ว'
      } else {
        status = 'ยังไม่ส่งเงิน'
      }

      return {
        area,
        date,
        sendmoney,
        summary,
        diff,
        change,
        status,
        good,
        damaged,
        diffChange
      }
    })
    const fullMonthArr1 = fullMonthArr.map(item => ({
      Amount_Send: Math.ceil(item.sendmoney),
      DATE: item.date,
      WH: user.warehouse
    }))

    const fullMonthArr2 = fullMonthArr.map(item => ({
      // ...item,
      TRANSFER_DATE: item.date,
      Amount: Math.ceil(item.summary),
      WH: user.warehouse
    }))
    const sumSendMoney = fullMonthArr.reduce((sum, item) => {
      return sum + (item.sendmoney || 0)
    }, 0)

    const sumSummary = fullMonthArr.reduce((sum, item) => {
      return sum + (item.summary || 0)
    }, 0)

    const sumSummaryDif = fullMonthArr.reduce((sum, item) => {
      return sum + (item.diff || 0)
    }, 0)

    const sumChange = fullMonthArr.reduce((sum, item) => {
      return sum + (item.change || 0)
    }, 0)
    const sumGood = fullMonthArr.reduce((sum, item) => {
      return sum + (item.good || 0)
    }, 0)
    const sumDamaged = fullMonthArr.reduce((sum, item) => {
      return sum + (item.damaged || 0)
    }, 0)

    const diffChange = fullMonthArr.reduce((sum, item) => {
      return sum + (item.diffChange || 0)
    }, 0)

    // const io = getSocket()
    // io.emit('order/summaryDaily', {});

    const sendMoneyUpdateData = fullMonthArr1.filter(
      item => item.Amount_Send > 0
    )
    const totalSaleUpdateData = fullMonthArr2.filter(item => item.Amount > 0)

    // res.status(200).json({
    //   status: 200,
    //   message: 'success',
    //   sendmoney: sendMoneyUpdateData,
    //   total: totalSaleUpdateData
    // })

    await dataUpdateSendMoney('cash', sendMoneyUpdateData, ['DATE', 'WH'])
    await dataUpdateTotalSale('cash', totalSaleUpdateData, [
      'TRANSFER_DATE',
      'WH'
    ])
    res.status(200).json({
      status: 200,
      message: 'success'
      // sendmoney: sendMoneyUpdateData,
      // total: totalSaleUpdateData
    })
  } catch (error) {
    console.error('updateSendmoneyOld ❌', error)
    res.status(500).json({
      status: 500,
      message: error.message || 'Internal server error'
    })
  }
}

exports.sendmoneyToExcel = async (req, res) => {
  const { excel, period, start, end } = req.query
  const channel = 'cash'

  const { User } = getModelsByChannel(channel, res, userModel)
  const { Order } = getModelsByChannel(channel, res, orderModel)
  const { Refund } = getModelsByChannel(channel, res, refundModel)
  const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)

  const userData = await User.find({ role: 'sale' }).select('area')
  let startDate, endDate

  if (start && end) {
    // ตัด string แล้ว parse เป็น Date
    startDate = new Date(
      `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(
        6,
        8
      )}T00:00:00+07:00`
    )
    endDate = new Date(
      `${end.slice(0, 4)}-${end.slice(4, 6)}-${end.slice(
        6,
        8
      )}T23:59:59.999+07:00`
    )
  } else if (period) {
    const range = rangeDate(period) // ฟังก์ชันที่คุณมีอยู่แล้ว
    startDate = range.startDate
    endDate = range.endDate
  } else {
    return res
      .status(400)
      .json({ status: 400, message: 'period or start/end are required!' })
  }

  const matchQuery = {
    ...(period ? { period } : {}),
    createdAt: { $gte: startDate, $lt: endDate }
  }
  const matchQuerySend = {
    ...(period ? { period } : {}),
    dateAt: { $gte: startDate, $lt: endDate }
  }

  // console.log(matchQuery)

  const sumByType = async (Model, type, area) => {
    const result = await Model.aggregate([
      {
        $match: {
          type,
          'store.area': area,
          status: { $nin: ['canceled', 'delete'] }
        }
      },
      {
        $match: matchQuery
      },
      { $group: { _id: null, sendmoney: { $sum: '$total' } } }
    ])
    return result.length > 0 ? result[0].sendmoney : 0
  }

  const sumByTypeChangeRefund = async (Model, type, area) => {
    const result = await Model.aggregate([
      {
        $match: {
          type,
          'store.area': area,
          status: { $nin: ['pending', 'canceled', 'delete'] }
        }
      },
      {
        $match: matchQuery
      },
      { $group: { _id: null, sendmoney: { $sum: '$total' } } }
    ])
    return result.length > 0 ? result[0].sendmoney : 0
  }

  let dataFinal = []
  let dataFinalExcel = []

  for (item of userData) {
    const saleSum = await sumByType(Order, 'sale', item.area)
    const changeSum = await sumByTypeChangeRefund(Order, 'change', item.area)
    const refundSum = await sumByTypeChangeRefund(Refund, 'refund', item.area)

    const totalSale = saleSum + (changeSum - refundSum)
    const alreadySentDocs = await SendMoney.aggregate([
      {
        $match: {
          area: item.area
        }
      },
      {
        $match: matchQuerySend
      },
      { $unwind: '$imageList' },
      {
        $group: {
          _id: null, // ไม่ group ตามค่าใด ๆ
          totalSent: { $sum: '$sendmoney' },
          images: { $push: '$imageList.path' }
        }
      },
      {
        $project: {
          _id: 0, // ตัด _id ทิ้ง
          totalSent: 1,
          images: 1
        }
      }
    ])

    // console.log(alreadySentDocs);

    const dataTran = {
      area: item.area,
      sale: to2(saleSum),
      refund: to2(changeSum - refundSum),
      totalSale: to2(totalSale),
      sendmoney: to2(alreadySentDocs[0]?.totalSent ?? 0),
      diff: to2(alreadySentDocs[0]?.totalSent - totalSale ?? 0),
      image: alreadySentDocs[0]?.images
    }

    const dataTranExcel = {
      เขตการขาย: item.area,
      ยอดขาย: to2(saleSum),
      ผลต่างใบเปลี่ยน: to2(changeSum - refundSum),
      รวมยอดขาย: to2(totalSale),
      ยอดชำระเงิน: to2(alreadySentDocs[0]?.totalSent ?? 0),
      'ยอดส่งเงิน ขาด - เกิน': to2(
        alreadySentDocs[0]?.totalSent - totalSale ?? 0
      )
    }
    dataFinal.push(dataTran)
    dataFinalExcel.push(dataTranExcel)
  }

  if (excel == 'true') {
    const wb = xlsx.utils.book_new()
    const ws = xlsx.utils.json_to_sheet(dataFinalExcel)
    xlsx.utils.book_append_sheet(wb, ws, `sendMoney`)

    const tempPath = path.join(os.tmpdir(), `sendMoney.xlsx`)
    xlsx.writeFile(wb, tempPath)

    res.download(tempPath, `sendMoney.xlsx`, err => {
      if (err) {
        console.error('❌ Download error:', err)
        // อย่าพยายามส่ง response ซ้ำถ้า header ถูกส่งแล้ว
        if (!res.headersSent) {
          res.status(500).send('Download failed')
        }
      }

      // ✅ ลบไฟล์ทิ้งหลังจากส่งเสร็จ (หรือส่งไม่สำเร็จ)
      fs.unlink(tempPath, () => {})
    })
  } else {
    return res.status(200).json({
      status: 200,
      message: 'Sucess',
      data: dataFinal
    })
  }
}
