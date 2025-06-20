const userModel = require('../../models/cash/user')
const ExcelJS = require('exceljs')

const orderModel = require('../../models/cash/sale')
const storeModel = require('../../models/cash/store')
const routeModel = require('../../models/cash/route')
const refundModel = require('../../models/cash/refund')
const DistributionModel = require('../../models/cash/distribution')
const promotionModel = require('../../models/cash/promotion')


const { getModelsByChannel } = require('../../middleware/channel')

exports.reportCheck = async (req, res) => {
  try {
    const channel = req.headers['x-channel']

    const { Store } = getModelsByChannel(channel, res, storeModel)
    const { User } = getModelsByChannel(channel, res, userModel)
    const { Route } = getModelsByChannel(channel, res, routeModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { Withdraw, Distribution } = getModelsByChannel(channel, res, DistributionModel)

    const start = new Date('2025-06-17T00:00:00.000Z')
    const end = new Date('2025-06-20T23:59:59.999Z')

    // 1. ดึง area ทั้งหมดที่ user sale ดูแล
    const user = await User.find({ role: 'sale' }).select('area')
    const areaId = [...new Set(user.flatMap(u => u.area))]

    // 2. ดึงข้อมูลทั้งหมดที่เกี่ยวข้องในช่วงวัน
    const stores = await Store.find({
      area: { $in: areaId },
      createdAt: { $gte: start, $lte: end }
    }).lean()

    const orders = await Order.find({
      'store.area': { $in: areaId },
      createdAt: { $gte: start, $lte: end }
    }).lean()

    const withdraws = await Withdraw.find({
      area: { $in: areaId },
      createdAt: { $gte: start, $lte: end }
    }).lean()

    const distributions = await Distribution.find({
      area: { $in: areaId },
      createdAt: { $gte: start, $lte: end }
    }).lean()

    const route = await Route.aggregate([
      {
        $match: {
          area: { $in: areaId }
        }
      },
      {
        $unwind: "$listStore"
      },
      {
        $match: {
          'listStore.date': { $gte: start, $lte: end }
        }
      }
    ])

    const refund = await Refund.find({
      'store.area': { $in: areaId },
      createdAt: { $gte: start, $lte: end }
    }).lean()

    // 3. สร้าง result รวมทุกอย่าง
    const result = areaId.map(areaName => {
      const foundStore = stores.some(s => s.area === areaName)
      const foundOrder = orders.some(o => o.store.area === areaName)
      const foundWithdraw = withdraws.some(w => w.area === areaName)
      const foundDistribution = distributions.some(d => d.area === areaName)
      const foundRoute = route.some(z => z.area === areaName)
      const foundRefund = refund.some(x => x.store.area === areaName)
      return {
        area: areaName,
        store: foundStore ? 1 : 0,
        Route: foundRoute ? 1 : 0,
        order: foundOrder ? 1 : 0,
        // withdraw: foundWithdraw ? 1 : 0, // ถ้าอยากใส่คอมเมนต์กลับมาได้เลย
        distribution: foundDistribution ? 1 : 0,
        refund: foundRefund ? 1 : 0,
      }
    })

    // ==== สร้างไฟล์ Excel ====
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('StatusByArea')

    // header ภาษาไทย
    worksheet.addRow(['เขต', 'โหลดโปรแกรม', 'เพิ่มร้านค้าใหม่', 'เข้าเยี่ยม', 'ขาย', 'เบิก', 'คืน'])

    // เติมข้อมูลแถว
    result.forEach(row => {
      const excelRow = worksheet.addRow([
        row.area,
        '', // โหลดโปรแกรม (ค่าว่าง)
        row.store,
        row.Route,
        row.order,
        row.distribution,
        row.refund
      ])
      // ใส่สีเฉพาะ cell ที่เป็น 1/0
      for (let i = 3; i <= 7; i++) { // index 3-7 คือคอลัมน์ store ถึง refund
        if (excelRow.getCell(i).value === 1) {
          excelRow.getCell(i).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC6EFCE' } // เขียวอ่อน
          }
        } else if (excelRow.getCell(i).value === 0) {
          excelRow.getCell(i).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFC7CE' } // แดงอ่อน
          }
        }
      }
    })

    // ปรับความกว้างคอลัมน์ให้ดูดี
    worksheet.columns.forEach(col => {
      col.width = 18
    })

    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        }
      })
    })

    await workbook.xlsx.writeFile('area_status.xlsx')
    // console.log('สร้างไฟล์ area_status.xlsx เรียบร้อยแล้ว')

    res.status(200).json({
      status: 200,
      message: 'success',
      data: result
    })

    // // ถ้าอยากส่งไฟล์ให้ client ดาวน์โหลดเลย ให้ใช้
    // res.download('area_status.xlsx')

  } catch (err) {
    console.error(err)
    res.status(500).json({ status: 500, message: 'Internal server error' })
  }
}