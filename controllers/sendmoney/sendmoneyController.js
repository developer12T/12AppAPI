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
const { replace, filter } = require('lodash')
const {
  getSeries,
  updateRunningNumber,
  getOrders,
  getChange,
  getRefund
} = require('../../middleware/order')
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
const {
  period,
  previousPeriod,
  rangeDate
} = require('../../utilities/datetime')
const { query } = require('mssql')
const { Item } = require('../../models/cash/master')
const sendmoney = require('../../models/cash/sendmoney')
const { exportExcel, exportSendMoneyMonthly } = require('../utils/exportExcel')

exports.addSendMoney = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { area, date, sendmoney, salePayer, saleCode } = req.body

    const year = parseInt(date.slice(0, 4), 10)
    const month = parseInt(date.slice(4, 6), 10)
    const day = parseInt(date.slice(6, 8), 10)
    const startOfMonthUTC = new Date(
      Date.UTC(year, month - 1, day - 1, 17, 0, 0)
    )
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
        sendmoneyAcc: 0,
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
          sendmoneyAcc: 0,
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
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }
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
  try {
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
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }
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
    const { User } = getModelsByChannel('user', res, userModel)

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
          // VALUES: {
          //   $cond: [
          //     { $eq: ['$VALUES', null] },
          //     '0.00',
          //     { $toString: { $round: ['$VALUES', 2] } }
          //   ]
          // },
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

    const areaList = [...new Set(formatted.flatMap(item => item.AREA))]
    const dataOrder = await getOrders(
      areaList,
      res,
      channel,
      'area',
      start,
      end
    )
    const dataChange = await getChange(
      areaList,
      res,
      channel,
      'area',
      start,
      end
    )
    const dataRefund = await getRefund(
      areaList,
      res,
      channel,
      'area',
      start,
      end
    )

    let dataFinal = []

    // console.log(formatted)

    for (const row of formatted) {
      const dataOrderArea = dataOrder.filter(
        item => item.store.area === row.AREA
      )
      const dataChangeArea = dataChange.filter(
        item => item.store.area === row.AREA
      )
      const dataRefundArea = dataRefund.filter(
        item => item.store.area === row.AREA
      )

      const totalOrder = dataOrderArea.reduce(
        (sum, i) => sum + (i.total || 0),
        0
      )
      const totalChange = dataChangeArea.reduce(
        (sum, i) => sum + (i.total || 0),
        0
      )
      const totalRefund = dataRefundArea.reduce(
        (sum, i) => sum + (i.total || 0),
        0
      )

      const VALUES = to2(totalOrder + (totalChange - totalRefund))

      dataFinal.push({
        ...row,
        VALUES: VALUES
      })
    }

    res.status(200).json(dataFinal)
  } catch (err) {
    console.error('[getSendMoneyForAcc] ❌', err)
    res.status(500).json({
      status: 500,
      message: err.message || 'Internal server error'
    })
  }
}

exports.updateSendmoneyOld2 = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { User } = getModelsByChannel(channel, res, userModel)

    // ดึง user ทั้งหมดที่เป็น sale
    const users = await User.find({ role: 'sale' }).lean()
    if (!users.length) {
      return res
        .status(404)
        .json({ status: 404, message: 'No sale users found!' })
    }

    // เตรียม period เดือนปัจจุบัน
    const periodStr = period()
    const year = Number(periodStr.substring(0, 4))
    const month = Number(periodStr.substring(4, 6))

    // เวลาไทยและ UTC
    const thOffset = 7 * 60 * 60 * 1000
    const startOfMonthTH = new Date(year, month - 1, 1, 0, 0, 0, 0)
    const endOfMonthTH = new Date(year, month, 0, 23, 59, 59, 999)
    const startOfMonthUTC = new Date(startOfMonthTH.getTime() - thOffset)
    const endOfMonthUTC = new Date(endOfMonthTH.getTime() - thOffset)

    // แปลงวันที่เป็น yyyy-mm-dd เวลาไทย
    const getDateStrTH = dateUTC => {
      const dateTH = new Date(new Date(dateUTC).getTime() + thOffset)
      const day = dateTH.getDate().toString().padStart(2, '0')
      const mon = (dateTH.getMonth() + 1).toString().padStart(2, '0')
      const yr = dateTH.getFullYear()
      return `${yr}-${mon}-${day}`
    }

    // ✅ วนทุก user (area)
    for (const user of users) {
      const area = user.area
      console.log(`🔄 Processing area: ${area} (${user.warehouse})`)

      const [dataSendmoney, dataRefund, dataOrderSale, dataOrderChange] =
        await Promise.all([
          SendMoney.aggregate([
            {
              $match: {
                area: area,
                dateAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC }
              }
            },
            { $addFields: { createdAt: '$dateAt' } }
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

      // รวม sendmoney ต่อวัน
      const sumByDate = dataSendmoney.reduce((acc, item) => {
        const dateStr = getDateStrTH(item.createdAt)
        if (!acc[dateStr])
          acc[dateStr] = { summary: 0, status: item.status || '' }
        acc[dateStr].summary += item.sendmoney || 0
        return acc
      }, {})

      const sendMoneyMap = Object.fromEntries(
        Object.entries(sumByDate).map(([d, v]) => [d, v.summary])
      )

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

      const saleByDate = orderSaleListFlat.reduce((acc, o) => {
        acc[o.date] = (acc[o.date] || 0) + Number(o.price || 0)
        return acc
      }, {})

      const changeByDate = orderChangeListFlat.reduce((acc, o) => {
        acc[o.date] = (acc[o.date] || 0) + Number(o.price || 0)
        return acc
      }, {})

      const lastDay = new Date(year, month, 0).getDate()
      const allDateArr = Array.from(
        { length: lastDay },
        (_, i) =>
          `${year}-${month.toString().padStart(2, '0')}-${(i + 1)
            .toString()
            .padStart(2, '0')}`
      )

      const fullMonthArr = allDateArr.map(date => {
        const sendmoney = to2(sendMoneyMap[date] || 0)
        const refundToday = refundByDate[date] || []
        const good = to2(
          refundToday
            .filter(x => x.condition === 'good')
            .reduce((s, x) => s + Number(x.price), 0)
        )
        const damaged = to2(
          refundToday
            .filter(x => x.condition === 'damaged')
            .reduce((s, x) => s + Number(x.price), 0)
        )
        const summaryRaw = saleByDate[date] || 0
        const changeRaw = changeByDate[date] || 0
        const diffChange = to2(changeRaw - damaged - good)
        const summary = to2(summaryRaw + diffChange)
        const diff = to2(sendmoney - summary)
        const status = sendmoney > 0 ? 'ส่งเงินแล้ว' : 'ยังไม่ส่งเงิน'

        return {
          area,
          date,
          sendmoney,
          summary,
          diff,
          status,
          good,
          damaged,
          diffChange
        }
      })

      // เตรียมข้อมูล update SendMoney
      const sendMoneyUpdateData = fullMonthArr
        .filter(item => item.sendmoney > 0)
        .map(item => ({
          Amount_Send: Math.ceil(item.sendmoney),
          DATE: item.date,
          WH: user.warehouse
        }))

      if (sendMoneyUpdateData.length > 0) {
        await dataUpdateSendMoney('cash', sendMoneyUpdateData, ['DATE', 'WH'])
        console.log(`✅ Updated sendmoney for ${user.warehouse}`)
      }
    }

    res.status(200).json({
      status: 200,
      message: 'Success — updated sendmoney for all sale users'
    })
  } catch (error) {
    console.error('updateSendmoneyOld2 ❌', error)
    res.status(500).json({
      status: 500,
      message: error.message || 'Internal server error'
    })
  }
}

exports.updateSendmoneyOld2 = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { User } = getModelsByChannel(channel, res, userModel)

    // 🔹 ดึง user ทั้งหมดที่เป็น sale
    const users = await User.find({ role: 'sale' }).lean()
    if (!users.length) {
      return res
        .status(404)
        .json({ status: 404, message: 'No sale users found!' })
    }

    // 🔹 รับ period เดือนปัจจุบัน
    const periodStr = period()
    const year = Number(periodStr.substring(0, 4))
    const month = Number(periodStr.substring(4, 6))

    // 🔹 คำนวณช่วงเวลาเดือนนั้นใน UTC
    const thOffset = 7 * 60 * 60 * 1000
    const startOfMonthTH = new Date(year, month - 1, 1, 0, 0, 0, 0)
    const endOfMonthTH = new Date(year, month, 0, 23, 59, 59, 999)
    const startOfMonthUTC = new Date(startOfMonthTH.getTime() - thOffset)
    const endOfMonthUTC = new Date(endOfMonthTH.getTime() - thOffset)

    // 🔹 แปลงวันที่เป็น yyyy-mm-dd เวลาไทย
    const getDateStrTH = dateUTC => {
      const dateTH = new Date(new Date(dateUTC).getTime() + thOffset)
      const day = dateTH.getDate().toString().padStart(2, '0')
      const mon = (dateTH.getMonth() + 1).toString().padStart(2, '0')
      const yr = dateTH.getFullYear()
      return `${yr}-${mon}-${day}`
    }

    // 🔹 วนตาม user ทีละคน
    for (const user of users) {
      const area = user.area
      console.log(`🔄 Processing area: ${area} (${user.warehouse})`)

      const [dataSendmoney, dataRefund, dataOrderSale, dataOrderChange] =
        await Promise.all([
          SendMoney.aggregate([
            {
              $match: {
                area: area,
                dateAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC }
              }
            },
            { $addFields: { createdAt: '$dateAt' } }
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

      // รวมยอดส่งเงินรายวัน
      const sumByDate = dataSendmoney.reduce((acc, item) => {
        const dateStr = getDateStrTH(item.createdAt)
        if (!acc[dateStr])
          acc[dateStr] = { summary: 0, status: item.status || '' }
        acc[dateStr].summary += item.sendmoney || 0
        return acc
      }, {})
      const sendMoneyMap = Object.fromEntries(
        Object.entries(sumByDate).map(([d, v]) => [d, v.summary])
      )

      // สร้าง refund แบบแบน
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

      const saleByDate = orderSaleListFlat.reduce((acc, o) => {
        acc[o.date] = (acc[o.date] || 0) + Number(o.price || 0)
        return acc
      }, {})

      const changeByDate = orderChangeListFlat.reduce((acc, o) => {
        acc[o.date] = (acc[o.date] || 0) + Number(o.price || 0)
        return acc
      }, {})

      // 🔹 เตรียมวันที่ครบเดือน
      const lastDay = new Date(year, month, 0).getDate()
      const allDateArr = Array.from(
        { length: lastDay },
        (_, i) =>
          `${year}-${month.toString().padStart(2, '0')}-${(i + 1)
            .toString()
            .padStart(2, '0')}`
      )

      // 🔹 คำนวณ summary, diff ฯลฯ
      const fullMonthArr = allDateArr.map(date => {
        const sendmoney = to2(sendMoneyMap[date] || 0)
        const refundToday = refundByDate[date] || []
        const good = to2(
          refundToday
            .filter(x => x.condition === 'good')
            .reduce((s, x) => s + Number(x.price), 0)
        )
        const damaged = to2(
          refundToday
            .filter(x => x.condition === 'damaged')
            .reduce((s, x) => s + Number(x.price), 0)
        )
        const summaryRaw = saleByDate[date] || 0
        const changeRaw = changeByDate[date] || 0
        const diffChange = to2(changeRaw - damaged - good)
        const summary = to2(summaryRaw + diffChange)
        const diff = to2(sendmoney - summary)
        const status = sendmoney > 0 ? 'ส่งเงินแล้ว' : 'ยังไม่ส่งเงิน'

        return {
          area,
          date,
          sendmoney,
          summary,
          diff,
          status,
          good,
          damaged,
          diffChange
        }
      })

      // 🔹 เตรียมข้อมูล update ยอดขาย
      const totalSaleUpdateData = fullMonthArr
        .filter(item => item.summary > 0)
        .map(item => ({
          TRANSFER_DATE: item.date,
          Amount: Math.ceil(item.summary),
          WH: user.warehouse
        }))

      // 🔹 อัปเดตยอดขาย (TotalSale)
      if (totalSaleUpdateData.length > 0) {
        await dataUpdateTotalSale('cash', totalSaleUpdateData, [
          'TRANSFER_DATE',
          'WH'
        ])
        console.log(`✅ Updated total sale for ${user.warehouse}`)
      }
    }

    // ✅ ส่ง response สุดท้าย
    res.status(200).json({
      status: 200,
      message: 'Success — updated total sale for all sale users'
    })
  } catch (error) {
    console.error('updateSendmoneyOld2 ❌', error)
    res.status(500).json({
      status: 500,
      message: error.message || 'Internal server error'
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

    // await dataUpdateSendMoney('cash', sendMoneyUpdateData, ['DATE', 'WH'])
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
  try {
    const { channel, area, period, start, end, excel } = req.query
    // const channel = 'cash'

    const { User } = getModelsByChannel(channel, res, userModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)

    function formatDDMMYYYY (dateStr) {
      const y = dateStr.slice(0, 4)
      const m = dateStr.slice(4, 6)
      const d = dateStr.slice(6, 8)
      return `${d}-${m}-${y}`
    }

    // -------------------------
    // 1) DATE RANGE
    // -------------------------
    let startDate, endDate

    if (start && end) {
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
      const range = rangeDate(period)
      startDate = range.startDate
      endDate = range.endDate
    } else {
      return res.status(400).json({
        status: 400,
        message: 'period หรือ start/end ต้องมีอย่างใดอย่างหนึ่ง'
      })
    }

    const matchMain = { createdAt: { $gte: startDate, $lt: endDate } }
    const matchSend = { dateAt: { $gte: startDate, $lt: endDate } }

    // -------------------------
    // 2) AREA FILTER
    // -------------------------
    const parseArray = v => {
      if (!v) return []
      try {
        return JSON.parse(v)
      } catch {
        return String(v).split(',')
      }
    }

    const areaArray = parseArray(area)

    let areas
    if (areaArray.length > 0) {
      areas = areaArray.map(a => String(a).trim())
    } else {
      areas = await User.find({ role: 'sale' }).distinct('area')
    }

    // ดึงรายชื่อผู้ขายตาม area
    const users = await User.find(
      { area: { $in: areas } },
      { area: 1, firstName: 1, surName: 1 }
    ).lean()

    // ทำเป็น Map เพื่อเรียกชื่อเร็วขึ้น
    const userMap = {}
    users.forEach(u => {
      const name = `${u.firstName || ''} ${u.surName || ''}`.trim()
      userMap[u.area] = name
    })

    // -------------------------
    // 3) AGGREGATE — DAILY (ไม่รวม)
    // -------------------------

    // DAILY SALE
    const saleAgg = await Order.aggregate([
      {
        $match: {
          type: 'sale',
          'store.area': { $in: areas },
          status: { $nin: ['canceled', 'delete'] }
        }
      },
      { $match: matchMain },
      {
        $project: {
          area: '$store.area',
          total: 1,
          date: {
            $dateToString: {
              format: '%Y%m%d',
              date: '$createdAt',
              timezone: '+07:00'
            }
          }
        }
      },
      {
        $group: {
          _id: { area: '$area', date: '$date' },
          total: { $sum: '$total' }
        }
      }
    ])

    // DAILY CHANGE
    const changeAgg = await Order.aggregate([
      {
        $match: {
          type: 'change',
          'store.area': { $in: areas },
          status: { $nin: ['pending', 'canceled', 'delete'] }
        }
      },
      { $match: matchMain },
      {
        $project: {
          area: '$store.area',
          total: 1,
          date: {
            $dateToString: {
              format: '%Y%m%d',
              date: '$createdAt',
              timezone: '+07:00'
            }
          }
        }
      },
      {
        $group: {
          _id: { area: '$area', date: '$date' },
          total: { $sum: '$total' }
        }
      }
    ])

    // DAILY REFUND
    const refundAgg = await Refund.aggregate([
      {
        $match: {
          type: 'refund',
          'store.area': { $in: areas },
          status: { $nin: ['pending', 'canceled', 'delete'] }
        }
      },
      { $match: matchMain },
      {
        $project: {
          area: '$store.area',
          total: 1,
          date: {
            $dateToString: {
              format: '%Y%m%d',
              date: '$createdAt',
              timezone: '+07:00'
            }
          }
        }
      },
      {
        $group: {
          _id: { area: '$area', date: '$date' },
          total: { $sum: '$total' }
        }
      }
    ])

    // DAILY SENDMONEY
    const sendAgg = await SendMoney.aggregate([
      { $match: { area: { $in: areas } } },
      { $match: matchSend },
      {
        $project: {
          area: 1,
          sendmoney: 1,
          sendmoneyAcc: 1,
          imageList: 1,
          date: {
            $dateToString: {
              format: '%Y%m%d',
              date: '$dateAt',
              timezone: '+07:00'
            }
          }
        }
      },
      {
        $group: {
          _id: { area: '$area', date: '$date' },
          totalAcc: { $sum: '$sendmoneyAcc' }, // <== เพิ่ม
          totalSent: { $sum: '$sendmoney' },
          images: { $push: '$imageList.path' }
        }
      }
    ])

    // -------------------------
    // 4) MAP เป็น daily[area][date]
    // -------------------------

    const daily = {} // daily[area][date]

    const initRow = () => ({
      sale: 0,
      change: 0,
      refund: 0,
      totalSale: 0,
      sendmoney: 0,
      sendmoneyAcc: 0,
      diff: 0,
      image: []
    })

    const put = (area, date) => {
      if (!daily[area]) daily[area] = {}
      if (!daily[area][date]) daily[area][date] = initRow()
      return daily[area][date]
    }

    // SALE
    saleAgg.forEach(e => {
      const { area, date } = e._id
      const row = put(area, date)
      row.sale = e.total
    })

    // CHANGE
    changeAgg.forEach(e => {
      const { area, date } = e._id
      const row = put(area, date)
      row.change = e.total
    })

    // REFUND
    refundAgg.forEach(e => {
      const { area, date } = e._id
      const row = put(area, date)
      row.refund = e.total
    })

    // SENDMONEY
    sendAgg.forEach(e => {
      const { area, date } = e._id
      const row = put(area, date)
      row.sendmoney = e.totalSent || 0
      row.image = e.images || []
      row.sendmoneyAcc = e.totalAcc || 0 // <== เพิ่มตรงนี้
    })

    // -------------------------
    // 5) CALCULATE totalSale + diff
    // -------------------------

    const finalRows = []

    for (const area of Object.keys(daily)) {
      for (const date of Object.keys(daily[area])) {
        const row = daily[area][date]

        row.totalSale = row.sale + (row.change - row.refund)
        row.diff = row.sendmoney - row.totalSale

        finalRows.push({
          area,
          areaAndName: `${area}-${userMap[area] || 'ไม่พบชื่อ'}`.trim(),
          date: formatDDMMYYYY(date),
          sale: to2(row.sale),
          change: to2(row.change),
          refund: to2(row.refund),
          totalSale: to2(row.totalSale),
          sendmoney: to2(row.sendmoney),
          diff: to2(row.diff),
          sendmoneyAcc: to2(row.sendmoneyAcc),
          image: row.image[0]
        })
      }
    }

    // เรียงวันที่ก่อนส่งกลับ
    finalRows.sort((a, b) => {
      // แปลงวันที่ dd-mm-yyyy → yyyymmdd
      const da = a.date.split('-').reverse().join('')
      const db = b.date.split('-').reverse().join('')

      // 1) เรียงตามวันที่ก่อน (น้อย → มาก)
      const dateCompare = da.localeCompare(db)
      if (dateCompare !== 0) return dateCompare

      // 2) หากวันที่ตรงกัน → เรียงตามชื่อเขต (area)
      return a.area.localeCompare(b.area)
    })

    // -------------------------
    // 6) EXPORT EXCEL
    // -------------------------
    if (excel === 'true') {
      const excelRows = finalRows.map(r => ({
        เขตการขาย: r.area,
        วันที่: r.date,
        ยอดขาย: r.sale,
        ใบเปลี่ยน: r.change,
        ใบคืน: r.refund,
        รวมยอดขาย: r.totalSale,
        ยอดส่งเงิน: r.sendmoney,
        ขาดเกิน: r.diff
      }))

      // ⚠️ Validate
      if (!period) {
        return res.status(400).json({
          status: 400,
          message: 'ต้องใช้ period เมื่อ export แบบรายเดือน'
        })
      }

      const yearAD = parseInt(period.slice(0, 4))
      const month = parseInt(period.slice(4, 6))
      const yearTH = yearAD + 543
      const monthNum = month

      const wb = xlsx.utils.book_new()
      const ws = xlsx.utils.json_to_sheet(excelRows)
      xlsx.utils.book_append_sheet(wb, ws, 'sendMoneyDaily')

      const tempPath = path.join(os.tmpdir(), 'sendMoneyDaily.xlsx')
      xlsx.writeFile(wb, tempPath)

      // return res.download(tempPath, 'sendMoneyDaily.xlsx', err => {
      //   if (!err) fs.unlink(tempPath, () => {})
      // })

      // return exportExcel(
      //   res,
      //   excelRows,
      //   'sendMoneyDaily', // Sheet name
      //   'sendMoneyDaily.xlsx' // Download file name
      // )
      return exportSendMoneyMonthly(res, finalRows, yearTH, monthNum)
    }

    // -------------------------
    // 7) RETURN JSON
    // -------------------------
    return res.status(200).json({
      status: 200,
      message: 'Daily Success',
      data: finalRows
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ status: 500, message: err.message })
  }
}

exports.updateSendmoneyAcc = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    let { sendmoneyAcc, date, area } = req.body
    const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)

    // 🟦 Convert "DD-MM-YYYY" → "YYYY-MM-DD"
    if (date.includes('-')) {
      const [dd, mm, yyyy] = date.split('-')
      date = `${yyyy}-${mm}-${dd}` // convert
    }

    // 🟦 Create date range (UTC+7)
    const start = new Date(`${date}T00:00:00+07:00`)
    const end = new Date(`${date}T23:59:59.999+07:00`)

    const updatedStore = await SendMoney.findOneAndUpdate(
      {
        area: area,
        dateAt: { $gte: start, $lt: end }
      },
      {
        $set: { sendmoneyAcc }
      },
      { new: true }
    )

    return res.status(200).json({
      status: 200,
      message: 'successfully',
      data: updatedStore
    })
  } catch (error) {
    return res.status(500).json({
      status: 500,
      message: 'Internal server error',
      error: error.message
    })
  }
}

exports.fixSendmoney = async (req, res) => {
  try {
    const channel = 'cash'
    const { User } = getModelsByChannel(channel, null, userModel)
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' })
    }

    const users = await User.find({ role: 'sale' })
      .select('area warehouse')
      .lean()

    // 2) ทำ map zone → warehouse
    const zoneToWH = {}
    users.forEach(u => {
      if (u.area) {
        zoneToWH[u.area.trim()] = u.warehouse
      }
    })

    // อ่านไฟล์จาก buffer
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' })

    // ตรวจสอบว่า workbook มี Sheets จริงมั้ย
    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({
        message: 'Invalid Excel file: No sheets found'
      })
    }

    // เลือก sheet แรก
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]

    // แปลงเป็น JSON
    const excelData = xlsx.utils.sheet_to_json(worksheet, { defval: '' })

    const year = 2025
    const month = 11

    const excelJson = transformExcelData(excelData)

    const fullMonthArr = convertToFullMonthArr(excelJson, year, month)

    const sendMoneyUpdateData = fullMonthArr
      .filter(item => item.sendmoney > 0)
      .map(item => ({
        Amount_Send: Math.ceil(item.sendmoney),
        DATE: item.date,
        WH: zoneToWH[item.zone] || null // หา WH ตาม zone
      }))
    // const sendMoneyUpdateData = fullMonthArr
    //   .filter(item => item.sendmoney > 0)
    //   .map(item => ({
    //     Amount_Send: Math.ceil(item.sendmoney),
    //     DATE: item.date,
    //     WH: user.warehouse
    //   }))

    if (sendMoneyUpdateData.length > 0) {
      await dataUpdateSendMoney('cash', sendMoneyUpdateData, ['DATE', 'WH'])
      console.log(`✅ Updated sendmoney `)

      return res.json({
        message: 'File processed successfully',
        data: sendMoneyUpdateData
      })
    }

    // return res.json({
    //   message: 'File processed successfully',
    //   data: sendMoneyUpdateData
    // })
  } catch (error) {
    return res.status(500).json({
      status: 500,
      message: 'Internal server error',
      error: error.message
    })
  }
}

function transformExcelData (excelData) {
  // ต้องมีอย่างน้อย 2 แถว (หัวตาราง + วันที่)
  if (!excelData || excelData.length < 2) {
    throw new Error('Invalid Excel format – missing header rows')
  }

  const result = []

  const headerRow = excelData[1] // แถววันที่ เช่น 1,2,3,...
  if (!headerRow) {
    throw new Error('Cannot read header row')
  }

  // map key → day number เช่น "__EMPTY_3" → 4
  const dayMap = Object.keys(headerRow)
    .filter(key => key.startsWith('__EMPTY'))
    .reduce((map, key, index) => {
      map[key] = headerRow[key]
      return map
    }, {})

  // เริ่ม loop ข้อมูลจริงแถวที่ 2 เป็นต้นไป
  for (let i = 2; i < excelData.length; i++) {
    const row = excelData[i]
    if (!row) continue

    const zoneName = row['สรุปยอดส่งเงิน ประจำเดือน พฤศจิกายน 2025']
    if (!zoneName || zoneName.trim() === '') continue

    const obj = { Zone: zoneName.slice(0, 5) }

    for (const key in row) {
      if (key.startsWith('__EMPTY')) {
        const day = dayMap[key]
        if (day && row[key] !== '') {
          obj[day] = Number(row[key])
        }
      }
    }

    result.push(obj)
  }

  return result
}

function convertToFullMonthArr (data, year, month) {
  const fullMonthArray = []

  const filtered = data.filter(row => row.Zone !== 'รวม' && row.Zone !== '')

  filtered.forEach(row => {
    const zone = row.Zone

    // loop ทุก key ที่เป็นตัวเลขวัน
    Object.keys(row).forEach(day => {
      if (!/^\d+$/.test(day)) return // ข้าม key ไม่ใช่ตัวเลขวัน

      const sendmoney = Number(row[day] || 0)
      const date = `${year}-${String(month).padStart(2, '0')}-${String(
        day
      ).padStart(2, '0')}`

      fullMonthArray.push({
        zone,
        date,
        sendmoney
      })
    })
  })

  return fullMonthArray
}

exports.addSendMoneyToColumnAcc = async (req, res) => {
  try {
    const { period, date } = req.query
    const channel = 'cash'

    const { User } = getModelsByChannel('user', res, userModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { SendMoney } = getModelsByChannel(channel, res, sendmoneyModel)

    const dataUser = await User.find({
      platformType: 'CASH',
      role: 'sale'
    })

    for (const row of dataUser) {
      const sendmoneyData = await SendMoney.findOne({
        area: row.area,
        period: period,
        dateAt: date
      })

      if (!sendmoneyData) continue

      await SendMoney.updateOne(
        {
          area: row.area,
          period: period,
          dateAt: date
        },
        {
          $set: {
            sendmoneyAcc: sendmoneyData.sendmoney
          }
        }
      )
    }

    res.status(200).json({
      status: 200,
      message: 'Add data success',
      data: dataUser
    })
  } catch (error) {
    return res.status(500).json({
      status: 500,
      message: 'Internal server error',
      error: error.message
    })
  }
}
