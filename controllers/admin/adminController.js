const userModel = require('../../models/cash/user')
const ExcelJS = require('exceljs')
const path = require('path')
const os = require('os')
const fs = require('fs')
const orderModel = require('../../models/cash/sale')
const storeModel = require('../../models/cash/store')
const routeModel = require('../../models/cash/route')
const refundModel = require('../../models/cash/refund')
const DistributionModel = require('../../models/cash/distribution')
const promotionModel = require('../../models/cash/promotion')
const sendMoneyModel = require('../../models/cash/sendmoney')
const { getModelsByChannel } = require('../../middleware/channel')
const { Item } = require('../../models/cash/master')
const { getSocket } = require('../../socket')
exports.reportCheck = async (req, res) => {
  try {
    const { start, end, zone, team, area } = req.query

    // console.log(start, end)

    const channel = req.headers['x-channel']
    const { Store } = getModelsByChannel(channel, res, storeModel)
    const { User } = getModelsByChannel(channel, res, userModel)
    const { Route } = getModelsByChannel(channel, res, routeModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { SendMoney } = getModelsByChannel(channel, res, sendMoneyModel)
    const { Withdraw, Distribution } = getModelsByChannel(
      channel,
      res,
      DistributionModel
    )

    let startStr, endStr

    if (!start || !end) {
      const today = new Date()
      const yyyy = today.getUTCFullYear()
      const mm = String(today.getUTCMonth() + 1).padStart(2, '0')
      const dd = String(today.getUTCDate()).padStart(2, '0')
      const todayStr = `${yyyy}-${mm}-${dd}`
      startStr = new Date(`${todayStr}T00:00:00.000Z`)
      endStr = new Date(`${todayStr}T23:59:59.999Z`)
    } else {
      startStr = new Date(`${start}T00:00:00.000Z`)
      endStr = new Date(`${end}T23:59:59.999Z`)
    }
    const user = await User.find({ role: 'sale' }).select('area')
    let areaId = [...new Set(user.flatMap(u => u.area))]

    if (zone) {
      const zones = typeof zone === 'string' ? zone.split(',') : zone
      areaId = areaId.filter(a => zones.includes(a.slice(0, 2)))
    }

    if (team) {
      areaId = areaId.filter(a => `${a.slice(0, 2)}${a.charAt(3)}` === team)
    }

    if (area) {
      const areaArr = typeof area === 'string' ? area.split(',') : area
      areaId = areaId.filter(a => areaArr.includes(a))
    }

    const stores = await Store.find({
      area: { $in: areaId },
      createdAt: { $gte: startStr, $lte: endStr }
    }).lean()

    const orders = await Order.find({
      'store.area': { $in: areaId },
      createdAt: { $gte: startStr, $lte: endStr }
    }).lean()

    const sendMoneys = await SendMoney.find({
      area: { $in: areaId },
      createdAt: { $gte: startStr, $lte: endStr }
    }).lean()

    // const withdraws = await Withdraw.find({
    //   area: { $in: areaId },
    //   createdAt: { $gte: startStr, $lte: endStr }
    // }).lean()

    const distributions = await Distribution.find({
      area: { $in: areaId },
      createdAt: { $gte: startStr, $lte: endStr }
    }).lean()

    const route = await Route.aggregate([
      {
        $match: {
          area: { $in: areaId }
        }
      },
      {
        $unwind: '$listStore'
      },
      {
        $match: {
          'listStore.date': { $gte: startStr, $lte: endStr }
        }
      }
    ])

    const refund = await Refund.find({
      'store.area': { $in: areaId },
      createdAt: { $gte: startStr, $lte: endStr }
    }).lean()

    const result = areaId
      .map(areaName => {
        const foundStore = stores.some(s => s.area === areaName)
        const foundOrder = orders.some(o => o.store.area === areaName)
        // const foundWithdraw = withdraws.some(w => w.area === areaName)
        const foundDistribution = distributions.some(d => d.area === areaName)
        const foundRoute = route.some(z => z.area === areaName)
        const foundRefund = refund.some(x => x.store.area === areaName)

        const countStore = stores.filter(s => s.area === areaName).length
        const countOrder = orders.filter(o => o.store.area === areaName).length
        // const countWithdraw = withdraws.filter(w => w.area === areaName).length;
        const countSendmoney = sendMoneys.filter(s => s.area === areaName).length
        const countDistribution = distributions.filter(
          d => d.area === areaName
        ).length
        const countRoute = route.filter(r => r.area === areaName).length
        const countRefund = refund.filter(x => x.store.area === areaName).length

        return {
          area: areaName,
          store: countStore,
          Route: countRoute,
          order: countOrder,
          // withdraw: foundWithdraw ? 1 : 0, // ถ้าอยากใส่คอมเมนต์กลับมาได้เลย
          distribution: countDistribution,
          refund: countRefund,
          sendMoney: countSendmoney
        }
      })
      .sort((a, b) => a.area.localeCompare(b.area))



    // const io = getSocket()
    // io.emit('admin/reportCheck', {});


    res.status(200).json({
      status: 200,
      message: 'success',
      data: result
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ status: 500, message: 'Internal server error' })
  }
}

exports.reportCheckExcel = async (req, res) => {
  try {
    let { start, end, channel, zone, team, area } = req.query

    // console.log(start, end)

    // const channel = req.headers['x-channel']
    const { Store } = getModelsByChannel(channel, res, storeModel)
    const { User } = getModelsByChannel(channel, res, userModel)
    const { Route } = getModelsByChannel(channel, res, routeModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { SendMoney } = getModelsByChannel(channel, res, sendMoneyModel)
    const { Withdraw, Distribution } = getModelsByChannel(
      channel,
      res,
      DistributionModel
    )

    let startStr, endStr

    if (!start || !end) {
      const today = new Date()
      const yyyy = today.getUTCFullYear()
      const mm = String(today.getUTCMonth() + 1).padStart(2, '0')
      const dd = String(today.getUTCDate()).padStart(2, '0')
      const todayStr = `${yyyy}-${mm}-${dd}`
      startStr = new Date(`${todayStr}T00:00:00.000Z`)
      endStr = new Date(`${todayStr}T23:59:59.999Z`)
    } else {
      startStr = new Date(`${start}T00:00:00.000Z`)
      endStr = new Date(`${end}T23:59:59.999Z`)
    }

    const user = await User.find({ role: 'sale' }).select('area')
    let areaId = [...new Set(user.flatMap(u => u.area))]

    if (zone) {
      const zones = typeof zone === 'string' ? zone.split(',') : zone
      areaId = areaId.filter(a => zones.includes(a.slice(0, 2)))
    }

    if (team) {
      areaId = areaId.filter(a => `${a.slice(0, 2)}${a.charAt(3)}` === team)
    }

    if (area) {
      const areaArr = typeof area === 'string' ? area.split(',') : area
      areaId = areaId.filter(a => areaArr.includes(a))
    }

    const stores = await Store.find({
      area: { $in: areaId },
      createdAt: { $gte: startStr, $lte: endStr }
    }).lean()

    const orders = await Order.find({
      'store.area': { $in: areaId },
      createdAt: { $gte: startStr, $lte: endStr }
    }).lean()

    // const withdraws = await Withdraw.find({
    //   area: { $in: areaId },
    //   createdAt: { $gte: startStr, $lte: endStr }
    // }).lean()
    const sendMoneys = await SendMoney.find({
      area: { $in: areaId },
      createdAt: { $gte: startStr, $lte: endStr }
    }).lean()



    const distributions = await Distribution.find({
      area: { $in: areaId },
      createdAt: { $gte: startStr, $lte: endStr }
    }).lean()

    const route = await Route.aggregate([
      {
        $match: {
          area: { $in: areaId }
        }
      },
      {
        $unwind: '$listStore'
      },
      {
        $match: {
          'listStore.date': { $gte: startStr, $lte: endStr }
        }
      }
    ])

    const refund = await Refund.find({
      'store.area': { $in: areaId },
      createdAt: { $gte: startStr, $lte: endStr }
    }).lean()

    const result = areaId
      .map(areaName => {
        const foundStore = stores.some(s => s.area === areaName)
        const foundOrder = orders.some(o => o.store.area === areaName)
        // const foundWithdraw = withdraws.some(w => w.area === areaName)
        const foundDistribution = distributions.some(d => d.area === areaName)
        const foundRoute = route.some(z => z.area === areaName)
        const foundRefund = refund.some(x => x.store.area === areaName)
        const countSendmoney = sendMoneys.filter(s => s.area === areaName).length
        const countStore = stores.filter(s => s.area === areaName).length
        const countOrder = orders.filter(o => o.store.area === areaName).length
        // const countWithdraw = withdraws.filter(w => w.area === areaName).length;
        const countDistribution = distributions.filter(
          d => d.area === areaName
        ).length
        const countRoute = route.filter(r => r.area === areaName).length
        const countRefund = refund.filter(x => x.store.area === areaName).length

        return {
          area: areaName,
          store: countStore,
          Route: countOrder,
          order: countDistribution,
          // withdraw: foundWithdraw ? 1 : 0, // ถ้าอยากใส่คอมเมนต์กลับมาได้เลย
          distribution: countRoute,
          refund: countRefund,
          sendMoney: countSendmoney

        }
      })
      .sort((a, b) => a.area.localeCompare(b.area))

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet(`${start} To ${end}`)
    worksheet.addRow([
      'เขต',
      'โหลดโปรแกรม',
      'เพิ่มร้านค้าใหม่',
      'เข้าเยี่ยม',
      'ขาย',
      'เบิก',
      'คืน',
      'ส่งเงิน'
    ])
    result.forEach(row => {
      const excelRow = worksheet.addRow([
        row.area,
        '',
        row.store,
        row.Route,
        row.order,
        row.distribution,
        row.refund,
        row.sendMoney
      ])
      for (let i = 3; i <= 7; i++) {
        if (excelRow.getCell(i).value === 1) {
          excelRow.getCell(i).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC6EFCE' }
          }
        } else if (excelRow.getCell(i).value === 0) {
          excelRow.getCell(i).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFC7CE' }
          }
        }
      }
    })
    worksheet.columns.forEach(col => {
      col.width = 18
    })
    worksheet.eachRow(row => {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        }
      })
    })

    // ==== จุดสำคัญ ====
    const tempPath = path.join(os.tmpdir(), `area_status_${Date.now()}.xlsx`)
    await workbook.xlsx.writeFile(tempPath)

    res.download(tempPath, 'Checklist.xlsx', err => {
      if (err) {
        console.error('❌ Download error:', err)
        if (!res.headersSent) {
          res.status(500).send('Download failed')
        }
      }
      fs.unlink(tempPath, () => { }) // ลบ temp file ทิ้ง
    })

    // res.status(200).json({
    // status: 200,
    // message: 'Create Excel file',
    // data: result
    // })
  } catch (err) {
    console.error(err)
    res.status(500).json({ status: 500, message: 'Internal server error' })
  }
}

exports.createPowerPoint = async (req, res) => {
  const file = req.file
  if (!file) {
    return res.status(400).json({ status: 400, message: 'No file uploaded' })
  }
  res.status(200).json({
    status: 200,
    message: 'Create powerPoint file',
    file: file
  })
}
