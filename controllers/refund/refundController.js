// const { Refund } = require('../../models/cash/refund')
// const { Order } = require('../../models/cash/sale')
// const { Cart } = require('../../models/cash/cart')
// const { User } = require('../../models/cash/user')
const {
  generateOrderId,
  generateRefundId
} = require('../../utilities/genetateId')
const { summaryRefund } = require('../../utilities/summary')
const { rangeDate } = require('../../utilities/datetime')
const { uploadFiles } = require('../../utilities/upload')
const path = require('path')
const multer = require('multer')
const upload = multer({ storage: multer.memoryStorage() }).single('image')
const { period, previousPeriod } = require('../../utilities/datetime')
const refundModel = require('../../models/cash/refund')
const orderModel = require('../../models/cash/sale')
const cartModel = require('../../models/cash/cart')
const productModel = require('../../models/cash/product')
const userModel = require('../../models/cash/user')
const stockModel = require('../../models/cash/stock')
const storeModel = require('../../models/cash/store')
const approveLogModel = require('../../models/cash/approveLog')
const { getModelsByChannel } = require('../../middleware/channel')
const { ItemLotM3 } = require('../../models/cash/master')
const { Op, literal } = require('sequelize')

const {
  to2,
  getQty,
  updateStockMongo,
  getPeriodFromDate
} = require('../../middleware/order')
const { update } = require('lodash')
const { getSocket } = require('../../socket')

const xlsx = require('xlsx')
const os = require('os')
const fs = require('fs')

const orderTimestamps = {}

exports.checkout = async (req, res) => {
  try {
    const {
      type,
      area,
      period,
      storeId,
      note,
      latitude,
      longitude,
      shipping,
      payment
    } = req.body
    const channel = req.headers['x-channel']
    const { Cart } = getModelsByChannel(channel, res, cartModel)
    const { User } = getModelsByChannel(channel, res, userModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Store, TypeStore } = getModelsByChannel(channel, res, storeModel)
    const { Stock, StockMovementLog, StockMovement } = getModelsByChannel(
      channel,
      res,
      stockModel
    )

    if (!type || type !== 'refund') {
      return res
        .status(400)
        .json({ status: 400, message: 'Invalid type! Must be "refund".' })
    }

    const now = Date.now()
    const lastUpdate = orderTimestamps[storeId] || 0
    const ONE_MINUTE = 60 * 1000

    if (now - lastUpdate < ONE_MINUTE) {
      return res.status(429).json({
        status: 429,
        message:
          'This order was updated less than 1 minute ago. Please try again later!'
      })
    }
    orderTimestamps[storeId] = now

    setTimeout(() => {
      delete orderTimestamps[storeId]
    }, ONE_MINUTE)

    if (!type || !area || !storeId || !payment) {
      return res
        .status(400)
        .json({ status: 400, message: 'Missing required fields!' })
    }

    // console.log(type, area, storeId)

    const cart = await Cart.findOne({ type, area, storeId })
    // console.log("cart",cart)
    // if (!cart || cart.listProduct.length === 0) {
    if (!cart || cart.length === 0) {
      return res.status(404).json({ status: 404, message: 'Cart is empty!' })
    }

    const sale = await User.findOne({ area }).select(
      'username firstName surName warehouse tel saleCode salePayer'
    )
    if (!sale) {
      return res
        .status(404)
        .json({ status: 404, message: 'Sale user not found!' })
    }

    const refundOrderId = await generateRefundId(
      area,
      sale.warehouse,
      channel,
      res
    )
    const changeOrderId = await generateOrderId(
      area,
      sale.warehouse,
      channel,
      res
    )

    const storeData =
      (await Store.findOne({
        storeId: cart.storeId,
        area: cart.area
      }).lean()) || {}

    function isAug2025OrLater (createAt) {
      if (!createAt) return false

      // case: "YYYYMM" เช่น "202508"
      if (typeof createAt === 'string' && /^\d{6}$/.test(createAt)) {
        const y = Number(createAt.slice(0, 4))
        const m = Number(createAt.slice(4, 6))
        return y * 100 + m >= 2025 * 100 + 8
      }

      // case: Date / ISO / YYYY-MM-DD / YYYYMMDD
      const d = createAt instanceof Date ? createAt : new Date(createAt)
      // console.log(d)
      if (isNaN(d)) return false
      const ym = d.getFullYear() * 100 + (d.getMonth() + 1) // เดือนเริ่มที่ 0
      return ym >= 202508
    }

    // ✅ ต่อ address + subDistrict เฉพาะเมื่อถึงเกณฑ์
    const addressFinal = isAug2025OrLater(storeData.createdAt)
      ? [
          storeData.address,
          storeData.subDistrict && `ต.${storeData.subDistrict}`,
          storeData.district && `อ.${storeData.district}`,
          storeData.province && `จ.${storeData.province}`,
          storeData.postCode
        ]
          .filter(Boolean)
          .join(' ')
      : storeData.address

    const summary = await summaryRefund(cart, channel, res)
    // console.log('summary:', JSON.stringify(summary, null, 2))

    const refundOrder = new Refund({
      type: 'refund',
      orderId: refundOrderId,
      reference: changeOrderId,
      sale: {
        saleCode: sale.saleCode,
        salePayer: sale.salePayer,
        name: `${sale.firstName} ${sale.surName}`,
        tel: sale.tel,
        warehouse: sale.warehouse
      },
      store: {
        storeId: storeData.storeId,
        name: storeData.name,
        type: storeData.type,
        address: addressFinal,
        taxId: storeData.taxId,
        tel: storeData.tel,
        area: storeData.area,
        zone: storeData.zone
      },
      shipping: shipping,
      note,
      latitude,
      longitude,
      status: 'pending',
      statusTH: 'รอนำเข้า',
      listProduct: summary.listRefund,
      total: summary.totalRefund,
      totalExVat: parseFloat((summary.totalRefund / 1.07).toFixed(2)),
      vat: parseFloat(
        (summary.totalRefund - summary.totalRefund / 1.07).toFixed(2)
      ),
      listImage: [],
      createdBy: sale.username,
      period: period
    })

    // console.log("refundOrder",refundOrder)
    const changeOrder = new Order({
      type: 'change',
      orderId: changeOrderId,
      reference: refundOrderId,
      sale: {
        saleCode: sale.saleCode,
        salePayer: sale.salePayer,
        name: `${sale.firstName} ${sale.surName}`,
        tel: sale.tel,
        warehouse: sale.warehouse
      },
      store: {
        storeId: summary.store.storeId,
        name: summary.store.name,
        type: summary.store.type,
        address: summary.store.address,
        taxId: summary.store.taxId,
        tel: summary.store.tel,
        area: summary.store.area,
        zone: summary.store.zone
      },
      shipping: shipping,
      note,
      latitude,
      longitude,
      status: 'pending',
      statusTH: 'รอนำเข้า',
      listProduct: summary.listProduct,
      subtotal: summary.totalChange,
      total: summary.totalChange,
      totalExVat: parseFloat((summary.totalChange / 1.07).toFixed(2)),
      vat: parseFloat(
        (summary.totalChange - summary.totalChange / 1.07).toFixed(2)
      ),
      listPromotions: [],
      listImage: [],
      paymentMethod: payment,
      paymentStatus: 'unpaid',
      createdBy: sale.username,
      period: period
    })

    const qtyproduct = refundOrder.listProduct
      .filter(u => u.condition === 'good')
      .map(u => ({
        id: u.id,
        unit: u.unit,
        qty: u.qty,
        condition: u.condition,
        statusMovement: 'IN'
      }))

    const qtyproductchange = changeOrder.listProduct.map(u => {
      //   const promoDetail = u.listProduct.map(item => {
      return {
        id: u.id,
        unit: u.unit,
        qty: u.qty,
        statusMovement: 'OUT'
      }
      //   })
    })
    // console.log(qtyproductchange)
    // const fallbackPeriod = period || refundOrder.period
    // if (!fallbackPeriod) throw new Error('Missing period')

    const refundCalStock = {
      storeId: refundOrder.store.storeId,
      orderId: refundOrder.orderId,
      area: refundOrder.store.area,
      saleCode: refundOrder.sale.saleCode,
      period: period,
      warehouse: refundOrder.sale.warehouse,
      status: 'pending',
      statusTH: 'รอนำเข้า',
      action: 'Refund',
      type: 'Refund',
      product: qtyproduct
    }

    const changeCalStock = {
      storeId: refundOrder.store.storeId,
      orderId: refundOrder.orderId,
      area: refundOrder.store.area,
      saleCode: refundOrder.sale.saleCode,
      period: period,
      warehouse: refundOrder.sale.warehouse,
      status: 'pending',
      statusTH: 'รอนำเข้า',
      action: 'Change',
      type: 'Change',
      product: qtyproductchange
    }
    // ตัด stock เบล ver
    // const productQty = qtyproductPro.concat(qtyproduct);

    // for (const item of qtyproduct) {
    //   const factorPcsResult = await Product.aggregate([
    //     { $match: { id: item.productId } },
    //     {
    //       $project: {
    //         id: 1,
    //         listUnit: {
    //           $filter: {
    //             input: '$listUnit',
    //             as: 'unitItem',
    //             cond: { $eq: ['$$unitItem.unit', item.unit] }
    //           }
    //         }
    //       }
    //     }
    //   ])

    //   const factorCtnResult = await Product.aggregate([
    //     { $match: { id: item.productId } },
    //     {
    //       $project: {
    //         id: 1,
    //         listUnit: {
    //           $filter: {
    //             input: '$listUnit',
    //             as: 'unitItem',
    //             cond: { $eq: ['$$unitItem.unit', 'CTN'] }
    //           }
    //         }
    //       }
    //     }
    //   ])
    //   const factorCtn = factorCtnResult[0].listUnit[0].factor
    //   const factorPcs = factorPcsResult[0].listUnit[0].factor
    //   const factorPcsQty = item.qty * factorPcs
    //   const factorCtnQty = Math.floor(factorPcsQty / factorCtn)
    //   const data = await Stock.findOneAndUpdate(
    //     {
    //       area: area,
    //       period: period,
    //       'listProduct.productId': item.productId
    //     },
    //     {
    //       $inc: {
    //         'listProduct.$[elem].stockInPcs': +factorPcsQty,
    //         // 'listProduct.$[elem].balancePcs': +factorPcsQty,
    //         'listProduct.$[elem].stockInCtn': +factorCtnQty,
    //         // 'listProduct.$[elem].balanceCtn': +factorCtnQty
    //       }
    //     },
    //     {
    //       arrayFilters: [{ 'elem.productId': item.productId }],
    //       new: true
    //     }
    //   )
    // }

    // for (const item of qtyproductchange) {
    //   const factorPcsResult = await Product.aggregate([
    //     { $match: { id: item.productId } },
    //     {
    //       $project: {
    //         id: 1,
    //         listUnit: {
    //           $filter: {
    //             input: '$listUnit',
    //             as: 'unitItem',
    //             cond: { $eq: ['$$unitItem.unit', item.unit] }
    //           }
    //         }
    //       }
    //     }
    //   ])

    //   const factorCtnResult = await Product.aggregate([
    //     { $match: { id: item.productId } },
    //     {
    //       $project: {
    //         id: 1,
    //         listUnit: {
    //           $filter: {
    //             input: '$listUnit',
    //             as: 'unitItem',
    //             cond: { $eq: ['$$unitItem.unit', 'CTN'] }
    //           }
    //         }
    //       }
    //     }
    //   ])
    //   const factorCtn = factorCtnResult[0].listUnit[0].factor
    //   const factorPcs = factorPcsResult[0].listUnit[0].factor
    //   const factorPcsQty = item.qty * factorPcs
    //   const factorCtnQty = Math.floor(factorPcsQty / factorCtn)
    //   const data = await Stock.findOneAndUpdate(
    //     {
    //       area: area,
    //       period: period,
    //       'listProduct.productId': item.productId
    //     },
    //     {
    //       $inc: {
    //         'listProduct.$[elem].stockOutPcs': +factorPcsQty,
    //         // 'listProduct.$[elem].balancePcs': -factorPcsQty,
    //         'listProduct.$[elem].stockOutCtn': +factorCtnQty,
    //         // 'listProduct.$[elem].balanceCtn': -factorCtnQty
    //       }
    //     },
    //     {
    //       arrayFilters: [{ 'elem.productId': item.productId }],
    //       new: true
    //     }
    //   )
    // }

    const createdMovementRefund = await StockMovement.create({
      ...refundCalStock
    })

    await StockMovementLog.create({
      ...refundCalStock,
      refOrderId: createdMovementRefund._id
    })

    const createdMovementChange = await StockMovement.create({
      ...changeCalStock
    })

    await StockMovementLog.create({
      ...changeCalStock,
      refOrderId: createdMovementChange._id
    })

    await refundOrder.save()
    await changeOrder.save()
    await Cart.deleteOne({ type, area, storeId })

    const io = getSocket()
    io.emit('refund/checkout', {
      status: 200,
      message: 'Checkout successful!',
      data: {
        refundOrder,
        // listProduct
        changeOrder
      }
    })

    res.status(200).json({
      status: 200,
      message: 'Checkout successful!',
      data: {
        refundOrder,
        // listProduct
        changeOrder
      }
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.refundExcel = async (req, res) => {
  try {
    const { channel } = req.query
    let { startDate, endDate } = req.query
    const { area, team, zone } = req.query

    let statusArray = (req.query.status || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    if (statusArray.length === 0) {
      statusArray = ['pending', 'approved'] // default
    }

    // console.log(statusArray)

    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)

    if (!/^\d{8}$/.test(startDate)) {
      const nowTH = new Date(
        new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
      )
      const y = nowTH.getFullYear()
      const m = String(nowTH.getMonth() + 1).padStart(2, '0')
      const d = String(nowTH.getDate()).padStart(2, '0') // ← ใช้ getDate() ไม่ใช่ getDay()
      startDate = `${y}${m}${d}` // YYYYMMDD
      endDate = `${y}${m}${d}` // YYYYMMDD
    }

    const startTH = new Date(
      `${startDate.slice(0, 4)}-${startDate.slice(4, 6)}-${startDate.slice(
        6,
        8
      )}T00:00:00+07:00`
    )
    const endTH = new Date(
      `${endDate.slice(0, 4)}-${endDate.slice(4, 6)}-${endDate.slice(
        6,
        8
      )}T23:59:59.999+07:00`
    )

    let queryRefund = {
      createdAt: {
        $gte: startTH,
        $lte: endTH
      },
      status: { $nin: ['canceled', 'reject'] },
      status: { $in: statusArray },
      'store.area': { $ne: 'IT211' }
    }

    let queryChange = {
      createdAt: {
        $gte: startTH,
        $lte: endTH
      },
      'store.area': { $ne: 'IT211' },
      status: { $in: statusArray },
      status: { $nin: ['canceled', 'reject'] },
      type: { $in: ['change'] }
    }

    if (area) {
      queryRefund['store.area'] = area
      queryChange['store.area'] = area
    } else if (zone) {
      queryRefund['store.area'] = { $regex: `^${zone}`, $options: 'i' }
      queryChange['store.area'] = { $regex: `^${zone}`, $options: 'i' }
    }

    const pipelineChange = [
      {
        $match: queryChange
      },
      {
        $addFields: {
          createdAtThai: {
            $dateAdd: {
              startDate: '$createdAt',
              unit: 'hour',
              amount: 7
            }
          },
          team3: {
            $concat: [
              { $substrCP: ['$store.area', 0, 2] },
              { $substrCP: ['$store.area', 3, 1] }
            ]
          }
        }
      },

      {
        $sort: { createdAt: 1, orderId: 1 } // เรียงจากน้อยไปมาก (ASC) ถ้าอยากให้ใหม่สุดอยู่บน ใช้ -1
      }
    ]

    const pipelineRefund = [
      {
        $match: queryRefund
      },
      {
        $addFields: {
          createdAtThai: {
            $dateAdd: {
              startDate: '$createdAt',
              unit: 'hour',
              amount: 7
            }
          },
          team3: {
            $concat: [
              { $substrCP: ['$store.area', 0, 2] },
              { $substrCP: ['$store.area', 3, 1] }
            ]
          }
        }
      },
      {
        $sort: { createdAt: 1, orderId: 1 } // เรียงจากน้อยไปมาก (ASC) ถ้าอยากให้ใหม่สุดอยู่บน ใช้ -1
      }
    ]

    if (team) {
      pipelineChange.push({
        $match: {
          team3: { $regex: `^${team}`, $options: 'i' }
        }
      })
      pipelineRefund.push({
        $match: {
          team3: { $regex: `^${team}`, $options: 'i' }
        }
      })
    }

    const modelChange = await Order.aggregate(pipelineChange)
    const modelRefund = await Refund.aggregate(pipelineRefund)

    // console.log(modelChange)
    // console.log(modelRefund)
    // console.log()

    const tranFromChange = modelChange.flatMap(order => {
      let counterOrder = 0
      function formatDateToThaiYYYYMMDD (date) {
        const d = new Date(date)
        d.setHours(d.getHours() + 7) // บวก 7 ชั่วโมงให้เป็นเวลาไทย (UTC+7)

        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')

        return `${yyyy}${mm}${dd}`
      }

      // ใช้งาน
      const RLDT = formatDateToThaiYYYYMMDD(order.createdAt)

      const listProduct = order.listProduct.map(product => {
        return {
          proCode: '',
          id: product.id,
          name: product.name,
          group: product.group,
          brand: product.brand,
          size: product.size,
          flavour: product.flavour,
          qty: product.qty,
          unit: product.unit,
          unitName: product.unitName,
          price: product.price,
          subtotal: product.subtotal,
          discount: product.discount,
          netTotal: product.netTotal
        }
      })

      const productIDS = [...listProduct].flat()

      // console.log("productIDS",productIDS)
      return productIDS.map(product => {
        counterOrder++

        // const promoCount = 0; // สามารถเปลี่ยนเป็นตัวเลขอื่นเพื่อทดสอบ

        return {
          CUNO: order.store.storeId,
          FACI: 'F10',
          WHLO: order.sale.warehouse,
          ORNO: '',
          OAORTP: 'B31',
          RLDT: RLDT,
          ADID: '',
          CUOR: order.orderId,
          OAOREF: '',
          OBITNO: product.id,
          OBBANO: '',
          OBALUN: product.unit,
          OBORQA: `${product.qty}`,
          OBSAPR: `${product.price || 0}`,
          OBSPUN: product.unit,
          OBWHSL: '',
          ROUT: '',
          OBPONR: `${counterOrder}`,
          OBDIA2: `${product.discount || 0}`,
          OBRSCD: '',
          OBCMNO: '',
          OBPIDE: product.proCode,
          OBSMCD: order.sale.saleCode,
          OAORDT: RLDT,
          OAODAM: '0',
          OECRID: '',
          OECRAM: '',
          OECRID2: '',
          OECRAM2: '',
          OECRID3: '',
          OECRAM3: '',
          OECRID4: '',
          OECRAM4: '',
          OECRID5: '',
          OECRAM5: '',
          OARESP: '',
          OAYREF: '',
          OATEL2: '',
          OAWCON: '',
          OAFRE1: '',
          OATXAP: '',
          OATXAP2: '',
          OBDIA1: '',
          OBDIA3: '',
          OBDIA4: ''
        }
      })
    })

    // รวบรวม itemCode ทั้งหมดจาก refund
    const refundItems = modelRefund.flatMap(o => o.listProduct.map(p => p.id))
    // console.log(refundItems)
    const uniqueCodes = [...new Set(refundItems)]

    // ปีที่ยอมรับ
    const currentYear = new Date().getFullYear()
    const years = [
      currentYear,
      currentYear - 1,
      currentYear - 2,
      currentYear + 1
    ]

    // ดึงล็อตรวดเดียวจาก MSSQL (Sequelize)
    const lotRows = await ItemLotM3.findAll({
      where: {
        itemCode: { [Op.in]: uniqueCodes },
        expireDate: { [Op.or]: years.map(y => ({ [Op.like]: `${y}%` })) },
        [Op.and]: [literal('LEN(LTRIM(RTRIM([LMBANO]))) = 16')]
      },
      attributes: ['itemCode', 'lot'], // แค่นี้พอ
      raw: true
    })

    // ทำ map เพื่อ lookup เร็ว O(1)
    const lotMap = new Map()
    for (const r of lotRows) {
      const code = (r.itemCode || '').trim() // <<<<<< สำคัญ
      const lot = (r.lot || '').trim()
      const curr = lotMap.get(code)

      // ถ้ายังไม่มี หรือ lot นี้ใหม่กว่า ให้ทับ
      if (!curr || lot > curr) {
        // ตัวเลขความยาวเท่ากัน เปรียบเทียบ string ได้
        lotMap.set(code, lot)
      }
    }

    // console.log('uniqueCodes', uniqueCodes)
    // console.log('lotRows', lotRows)
    // console.log('lotMap', lotMap)

    // --- สร้าง tranFromRefund ให้แบน ---
    const tranFromRefundNested = await Promise.all(
      modelRefund.map(async order => {
        let counterOrder = 0

        const formatDateToThaiYYYYMMDD = date => {
          const d = new Date(date)
          d.setHours(d.getHours() + 7)
          const yyyy = d.getFullYear()
          const mm = String(d.getMonth() + 1).padStart(2, '0')
          const dd = String(d.getDate()).padStart(2, '0')
          return `${yyyy}${mm}${dd}`
        }

        const RLDT = formatDateToThaiYYYYMMDD(order.createdAt)

        const listProduct = await Promise.all(
          order.listProduct
            // .filter(p => p.condition === 'good')
            .map(async p => {
              // const lotData = await Item.findAll({
              //   where: {
              //     itemCode: p.id,
              //     expireDate: { [Op.like]: `23%` },
              //     [Op.and]: [{ lot: { [Op.regexp]: '^[0-9]{16}$' } }]
              //   }
              // })
              // const lotData = await Item.findOne({
              //   where: {
              //     itemCode: p.id,
              //     expireDate: {
              //       [Op.or]: years.map(y => ({ [Op.like]: `${y}%` }))
              //     },
              //     // date: {
              //     //   [Op.like]: `${p.expireDate.slice(0, 4)}%`
              //     // },
              //     // lot: { [Op.like]: `${p.expireDate.slice(2, 4)}%` },
              //     [Op.and]: [
              //       literal('LEN(LTRIM(RTRIM([Lot]))) = 16') // ความยาว 16 ตัวอักษร
              //       // literal("LTRIM(RTRIM([Lot])) NOT LIKE '%[^0-9]%'") // ไม่มีตัวที่ไม่ใช่ตัวเลข
              //     ]
              //   }
              // })
              return {
                proCode: '',
                id: p.id,
                name: p.name,
                group: p.group,
                brand: p.brand,
                size: p.size,
                flavour: p.flavour,
                qty: p.qty,
                unit: p.unit,
                unitName: p.unitName,
                price: p.price,
                subtotal: p.subtotal,
                discount: p.discount,
                netTotal: p.netTotal,
                lotNo: lotMap.get(p.id) || ''
                // lotNo: lotData?.lot || null
              }
            })
        )

        return listProduct.map(product => {
          counterOrder++
          return {
            CUNO: order.store.storeId,
            FACI: 'F10',
            WHLO: order.sale.warehouse,
            ORNO: '',
            OAORTP: 'A34', // << คืนของ
            RLDT: RLDT,
            ADID: '',
            CUOR: order.orderId,
            OAOREF: '',
            OBITNO: product.id,
            OBBANO: product.lotNo ?? '', // อย่าใช้ ${} ในอ็อบเจ็กต์
            OBALUN: product.unit,
            OBORQA: `-${product.qty}`,
            OBSAPR: `${product.price}`,
            OBSPUN: product.unit,
            OBWHSL: 'CS0001',
            ROUT: '',
            OBPONR: `${counterOrder}`,
            OBDIA2: `${product.discount || 0}`,
            OBRSCD: '',
            OBCMNO: '',
            OBPIDE: '',
            OBSMCD: order.sale.saleCode,
            OAORDT: RLDT,
            OAODAM: '0',
            OECRID: '',
            OECRAM: '',
            OECRID2: '',
            OECRAM2: '',
            OECRID3: '',
            OECRAM3: '',
            OECRID4: '',
            OECRAM4: '',
            OECRID5: '',
            OECRAM5: '',
            OARESP: '',
            OAYREF: '',
            OATEL2: '',
            OAWCON: '',
            OAFRE1: '',
            OATXAP: '',
            OATXAP2: '',
            OBDIA1: '',
            OBDIA3: '',
            OBDIA4: ''
          }
        })
      })
    )

    const tranFromRefund = tranFromRefundNested.flat()

    function yyyymmddToDdMmYyyy (dateString) {
      // สมมติ dateString คือ '20250804'
      const year = dateString.slice(0, 4)
      const month = dateString.slice(4, 6)
      const day = dateString.slice(6, 8)
      return `${day}${month}${year}`
    }

    // รวม Order + Refund ให้เป็นชุดข้อมูลเดียว
    const allTransactions = [...tranFromChange, ...tranFromRefund]

    const wb = xlsx.utils.book_new()
    const ws = xlsx.utils.json_to_sheet(allTransactions)
    xlsx.utils.book_append_sheet(
      wb,
      ws,
      `ESP${yyyymmddToDdMmYyyy(startDate)}_${yyyymmddToDdMmYyyy(endDate)}`
    )

    const tempPath = path.join(
      os.tmpdir(),
      `CA_${yyyymmddToDdMmYyyy(startDate)}_${yyyymmddToDdMmYyyy(endDate)}.xlsx`
    )
    xlsx.writeFile(wb, tempPath)

    res.download(
      tempPath,
      `CA_${yyyymmddToDdMmYyyy(startDate)}_${yyyymmddToDdMmYyyy(endDate)}.xlsx`,
      err => {
        if (err) {
          console.error('❌ Download error:', err)
          // อย่าพยายามส่ง response ซ้ำถ้า header ถูกส่งแล้ว
          if (!res.headersSent) {
            res.status(500).send('Download failed')
          }
        }

        // ✅ ลบไฟล์ทิ้งหลังจากส่งเสร็จ (หรือส่งไม่สำเร็จ)
        fs.unlink(tempPath, () => {})
      }
    )
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

exports.refundExcel2 = async (req, res) => {
  try {
    const { channel } = req.query
    let { startDate, endDate } = req.query
    const { area, team, zone } = req.query

    let statusArray = (req.query.status || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    if (statusArray.length === 0) {
      statusArray = ['pending', 'approved'] // default
    }

    // console.log(statusArray)

    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)

    if (!/^\d{8}$/.test(startDate)) {
      const nowTH = new Date(
        new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
      )
      const y = nowTH.getFullYear()
      const m = String(nowTH.getMonth() + 1).padStart(2, '0')
      const d = String(nowTH.getDate()).padStart(2, '0') // ← ใช้ getDate() ไม่ใช่ getDay()
      startDate = `${y}${m}${d}` // YYYYMMDD
      endDate = `${y}${m}${d}` // YYYYMMDD
    }

    const startTH = new Date(
      `${startDate.slice(0, 4)}-${startDate.slice(4, 6)}-${startDate.slice(
        6,
        8
      )}T00:00:00+07:00`
    )
    const endTH = new Date(
      `${endDate.slice(0, 4)}-${endDate.slice(4, 6)}-${endDate.slice(
        6,
        8
      )}T23:59:59.999+07:00`
    )

    let queryRefund = {
      createdAt: {
        $gte: startTH,
        $lte: endTH
      },
      status: { $nin: ['canceled', 'reject'] },
      status: { $in: statusArray },
      'store.area': { $ne: 'IT211' }
    }

    let queryChange = {
      createdAt: {
        $gte: startTH,
        $lte: endTH
      },
      'store.area': { $ne: 'IT211' },
      status: { $in: statusArray },
      status: { $nin: ['canceled', 'reject'] },
      type: { $in: ['change'] }
    }

    if (area) {
      queryRefund['store.area'] = area
      queryChange['store.area'] = area
    } else if (zone) {
      queryRefund['store.area'] = { $regex: `^${zone}`, $options: 'i' }
      queryChange['store.area'] = { $regex: `^${zone}`, $options: 'i' }
    }

    const pipelineChange = [
      {
        $match: queryChange
      },
      {
        $addFields: {
          createdAtThai: {
            $dateAdd: {
              startDate: '$createdAt',
              unit: 'hour',
              amount: 7
            }
          },
          team3: {
            $concat: [
              { $substrCP: ['$store.area', 0, 2] },
              { $substrCP: ['$store.area', 3, 1] }
            ]
          }
        }
      },

      {
        $sort: { createdAt: 1, orderId: 1 } // เรียงจากน้อยไปมาก (ASC) ถ้าอยากให้ใหม่สุดอยู่บน ใช้ -1
      }
    ]

    const pipelineRefund = [
      {
        $match: queryRefund
      },
      {
        $addFields: {
          createdAtThai: {
            $dateAdd: {
              startDate: '$createdAt',
              unit: 'hour',
              amount: 7
            }
          },
          team3: {
            $concat: [
              { $substrCP: ['$store.area', 0, 2] },
              { $substrCP: ['$store.area', 3, 1] }
            ]
          }
        }
      },
      {
        $sort: { createdAt: 1, orderId: 1 } // เรียงจากน้อยไปมาก (ASC) ถ้าอยากให้ใหม่สุดอยู่บน ใช้ -1
      }
    ]

    if (team) {
      pipelineChange.push({
        $match: {
          team3: { $regex: `^${team}`, $options: 'i' }
        }
      })
      pipelineRefund.push({
        $match: {
          team3: { $regex: `^${team}`, $options: 'i' }
        }
      })
    }

    const modelChange = await Order.aggregate(pipelineChange)
    const modelRefund = await Refund.aggregate(pipelineRefund)

    // console.log(modelChange)
    // console.log(modelRefund)
    // console.log()

    const tranFromChange = modelChange.flatMap(order => {
      let counterOrder = 0
      function formatDateToThaiYYYYMMDD (date) {
        const d = new Date(date)
        d.setHours(d.getHours() + 7) // บวก 7 ชั่วโมงให้เป็นเวลาไทย (UTC+7)

        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')

        return `${yyyy}${mm}${dd}`
      }

      // ใช้งาน
      const RLDT = formatDateToThaiYYYYMMDD(order.createdAt)

      const listProduct = order.listProduct.map(product => {
        return {
          proCode: '',
          id: product.id,
          name: product.name,
          group: product.group,
          brand: product.brand,
          size: product.size,
          flavour: product.flavour,
          qty: product.qty,
          unit: product.unit,
          unitName: product.unitName,
          price: product.price,
          subtotal: product.subtotal,
          discount: product.discount,
          netTotal: product.netTotal
        }
      })

      const productIDS = [...listProduct].flat()

      // console.log("productIDS",productIDS)
      return productIDS.map(product => {
        counterOrder++

        // const promoCount = 0; // สามารถเปลี่ยนเป็นตัวเลขอื่นเพื่อทดสอบ

        return {
          CUNO: order.store.storeId,
          FACI: 'F10',
          WHLO: order.sale.warehouse,
          AREA: order.sale.area,
          ORNO: '',
          OAORTP: 'B31',
          RLDT: RLDT,
          ADID: '',
          CUOR: order.orderId,
          OAOREF: '',
          OBITNO: product.id,
          OBBANO: '',
          OBALUN: product.unit,
          OBORQA: `${product.qty}`,
          OBSAPR: `${product.price || 0}`,
          OBSPUN: product.unit,
          OBWHSL: '',
          ROUT: '',
          OBPONR: `${counterOrder}`,
          OBDIA2: `${product.discount || 0}`,
          OBRSCD: '',
          OBCMNO: '',
          OBPIDE: product.proCode,
          OBSMCD: order.sale.saleCode,
          OAORDT: RLDT,
          OAODAM: '0',
          OECRID: '',
          OECRAM: '',
          OECRID2: '',
          OECRAM2: '',
          OECRID3: '',
          OECRAM3: '',
          OECRID4: '',
          OECRAM4: '',
          OECRID5: '',
          OECRAM5: '',
          OARESP: '',
          OAYREF: '',
          OATEL2: '',
          OAWCON: '',
          OAFRE1: '',
          OATXAP: '',
          OATXAP2: '',
          OBDIA1: '',
          OBDIA3: '',
          OBDIA4: ''
        }
      })
    })

    // รวบรวม itemCode ทั้งหมดจาก refund
    const refundItems = modelRefund.flatMap(o => o.listProduct.map(p => p.id))
    // console.log(refundItems)
    const uniqueCodes = [...new Set(refundItems)]

    // ปีที่ยอมรับ
    const currentYear = new Date().getFullYear()
    const years = [
      currentYear,
      currentYear - 1,
      currentYear - 2,
      currentYear + 1
    ]

    // ดึงล็อตรวดเดียวจาก MSSQL (Sequelize)
    const lotRows = await ItemLotM3.findAll({
      where: {
        itemCode: { [Op.in]: uniqueCodes },
        expireDate: { [Op.or]: years.map(y => ({ [Op.like]: `${y}%` })) },
        [Op.and]: [literal('LEN(LTRIM(RTRIM([LMBANO]))) = 16')]
      },
      attributes: ['itemCode', 'lot'], // แค่นี้พอ
      raw: true
    })

    // ทำ map เพื่อ lookup เร็ว O(1)
    const lotMap = new Map()
    for (const r of lotRows) {
      const code = (r.itemCode || '').trim() // <<<<<< สำคัญ
      const lot = (r.lot || '').trim()
      const curr = lotMap.get(code)

      // ถ้ายังไม่มี หรือ lot นี้ใหม่กว่า ให้ทับ
      if (!curr || lot > curr) {
        // ตัวเลขความยาวเท่ากัน เปรียบเทียบ string ได้
        lotMap.set(code, lot)
      }
    }

    // console.log('uniqueCodes', uniqueCodes)
    // console.log('lotRows', lotRows)
    // console.log('lotMap', lotMap)

    // --- สร้าง tranFromRefund ให้แบน ---
    const tranFromRefundNested = await Promise.all(
      modelRefund.map(async order => {
        let counterOrder = 0

        const formatDateToThaiYYYYMMDD = date => {
          const d = new Date(date)
          d.setHours(d.getHours() + 7)
          const yyyy = d.getFullYear()
          const mm = String(d.getMonth() + 1).padStart(2, '0')
          const dd = String(d.getDate()).padStart(2, '0')
          return `${yyyy}${mm}${dd}`
        }

        const RLDT = formatDateToThaiYYYYMMDD(order.createdAt)

        const listProduct = await Promise.all(
          order.listProduct
            // .filter(p => p.condition === 'good')
            .map(async p => {
              // const lotData = await Item.findAll({
              //   where: {
              //     itemCode: p.id,
              //     expireDate: { [Op.like]: `23%` },
              //     [Op.and]: [{ lot: { [Op.regexp]: '^[0-9]{16}$' } }]
              //   }
              // })
              // const lotData = await Item.findOne({
              //   where: {
              //     itemCode: p.id,
              //     expireDate: {
              //       [Op.or]: years.map(y => ({ [Op.like]: `${y}%` }))
              //     },
              //     // date: {
              //     //   [Op.like]: `${p.expireDate.slice(0, 4)}%`
              //     // },
              //     // lot: { [Op.like]: `${p.expireDate.slice(2, 4)}%` },
              //     [Op.and]: [
              //       literal('LEN(LTRIM(RTRIM([Lot]))) = 16') // ความยาว 16 ตัวอักษร
              //       // literal("LTRIM(RTRIM([Lot])) NOT LIKE '%[^0-9]%'") // ไม่มีตัวที่ไม่ใช่ตัวเลข
              //     ]
              //   }
              // })
              return {
                proCode: '',
                id: p.id,
                name: p.name,
                group: p.group,
                brand: p.brand,
                size: p.size,
                flavour: p.flavour,
                qty: p.qty,
                unit: p.unit,
                unitName: p.unitName,
                price: p.price,
                subtotal: p.subtotal,
                discount: p.discount,
                netTotal: p.netTotal,
                lotNo: lotMap.get(p.id) || ''
                // lotNo: lotData?.lot || null
              }
            })
        )

        return listProduct.map(product => {
          counterOrder++
          return {
            CUNO: order.store.storeId,
            FACI: 'F10',
            WHLO: order.sale.warehouse,
            AREA: order.sale.area,
            ORNO: '',
            OAORTP: 'A34', // << คืนของ
            RLDT: RLDT,
            ADID: '',
            CUOR: order.orderId,
            OAOREF: '',
            OBITNO: product.id,
            OBBANO: product.lotNo ?? '', // อย่าใช้ ${} ในอ็อบเจ็กต์
            OBALUN: product.unit,
            OBORQA: `-${product.qty}`,
            OBSAPR: `${product.price}`,
            OBSPUN: product.unit,
            OBWHSL: 'CS0001',
            ROUT: '',
            OBPONR: `${counterOrder}`,
            OBDIA2: `${product.discount || 0}`,
            OBRSCD: '',
            OBCMNO: '',
            OBPIDE: '',
            OBSMCD: order.sale.saleCode,
            OAORDT: RLDT,
            OAODAM: '0',
            OECRID: '',
            OECRAM: '',
            OECRID2: '',
            OECRAM2: '',
            OECRID3: '',
            OECRAM3: '',
            OECRID4: '',
            OECRAM4: '',
            OECRID5: '',
            OECRAM5: '',
            OARESP: '',
            OAYREF: '',
            OATEL2: '',
            OAWCON: '',
            OAFRE1: '',
            OATXAP: '',
            OATXAP2: '',
            OBDIA1: '',
            OBDIA3: '',
            OBDIA4: ''
          }
        })
      })
    )

    const tranFromRefund = tranFromRefundNested.flat()

    function yyyymmddToDdMmYyyy (dateString) {
      // สมมติ dateString คือ '20250804'
      const year = dateString.slice(0, 4)
      const month = dateString.slice(4, 6)
      const day = dateString.slice(6, 8)
      return `${day}${month}${year}`
    }

    // รวม Order + Refund ให้เป็นชุดข้อมูลเดียว
    const allTransactions = [...tranFromChange, ...tranFromRefund]

    const wb = xlsx.utils.book_new()
    const ws = xlsx.utils.json_to_sheet(allTransactions)
    xlsx.utils.book_append_sheet(
      wb,
      ws,
      `ESP${yyyymmddToDdMmYyyy(startDate)}_${yyyymmddToDdMmYyyy(endDate)}`
    )

    const tempPath = path.join(
      os.tmpdir(),
      `CA_${yyyymmddToDdMmYyyy(startDate)}_${yyyymmddToDdMmYyyy(endDate)}.xlsx`
    )
    xlsx.writeFile(wb, tempPath)

    res.download(
      tempPath,
      `CA_${yyyymmddToDdMmYyyy(startDate)}_${yyyymmddToDdMmYyyy(endDate)}.xlsx`,
      err => {
        if (err) {
          console.error('❌ Download error:', err)
          // อย่าพยายามส่ง response ซ้ำถ้า header ถูกส่งแล้ว
          if (!res.headersSent) {
            res.status(500).send('Download failed')
          }
        }

        // ✅ ลบไฟล์ทิ้งหลังจากส่งเสร็จ (หรือส่งไม่สำเร็จ)
        fs.unlink(tempPath, () => {})
      }
    )
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

exports.getRefundPending = async (req, res) => {
  try {
    const { type, area, zone, team, store, period, start, end } = req.query

    const channel = req.headers['x-channel']
    const { Refund } = getModelsByChannel(channel, res, refundModel)

    let areaQuery = {}

    if (area) {
      areaQuery['store.area'] = area
    } else if (zone) {
      areaQuery['store.zone'] = zone
    }

    areaQuery.status = 'pending'

    let query = {
      type,
      ...areaQuery,
      ...(period ? { period } : {})
    }

    const pipeline = [{ $match: query }]
    const refunds = await Refund.aggregate(pipeline)

    res.status(200).json({
      status: 200,
      message: 'Successful!',
      data: refunds.length
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getRefund = async (req, res) => {
  try {
    const { type, area, zone, team, store, period, start, end } = req.query

    const channel = req.headers['x-channel']
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)

    let response = []

    if (!type) {
      return res.status(400).json({ status: 400, message: 'type is required!' })
    }

    // ✅ คำนวณช่วงวัน
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

    let areaQuery = {}

    if (zone && !area) {
      areaQuery['store.area'] = { $regex: `^${zone}`, $options: 'i' }
    } else if (area.length == 5) {
      areaQuery['store.area'] = area
    }

    // if (area) {
    //   areaQuery.area = area
    // } else if (zone) {
    //   areaQuery.area = { $regex: `^${zone}`, $options: 'i' }
    // }

    let query = {
      type,
      ...areaQuery,
      ...(period ? { period } : {}),
      createdAt: { $gte: startDate, $lte: endDate }
    }

    if (store) {
      query['store.storeId'] = store
    }

    const pipeline = [
      // { $match: { status: 'pending' } },
      {
        $addFields: {
          zone: { $substrBytes: ['$store.area', 0, 2] },
          team3: {
            $concat: [
              { $substrCP: ['$store.area', 0, 2] },
              { $substrCP: ['$store.area', 3, 1] }
            ]
          }
        }
      },

      { $match: query }
    ]

    if (team) {
      pipeline.push({
        $match: {
          team3: { $regex: `^${team}`, $options: 'i' }
        }
      })
    }

    pipeline.push(
      {
        $project: {
          _id: 0,
          __v: 0,
          beauty: 0
        }
      },
      {
        $sort: {
          status: 1,
          createdAt: -1
        }
      }
    )

    const refunds = await Refund.aggregate(pipeline)

    // console.log(refunds)
    if (!refunds || refunds.length === 0) {
      return res.status(404).json({
        status: 404,
        message: 'No refund orders found!',
        data: []
      })
    }

    response = await Promise.all(
      refunds.map(async refund => {
        const orderChange = await Order.findOne({
          reference: refund.orderId,
          type: 'change'
        })
          .select('total')
          .lean()

        const totalChange = orderChange?.total || 0
        const totalRefund = refund.total || 0
        const total = (totalChange - totalRefund).toFixed(2)

        return {
          orderId: refund.orderId,
          orderNo: refund.orderNo,
          lowStatus: refund.lowStatus,
          heightStatus: refund.heightStatus,
          lineM3: refund.lineM3,
          area: refund.store.area,
          storeId: refund.store?.storeId || '',
          storeName: refund.store?.name || '',
          storeAddress: refund.store?.address || '',
          totalChange: totalChange.toFixed(2),
          totalRefund: totalRefund.toFixed(2),
          total: total,
          status: refund.status,
          statusTH: refund.statusTH,
          createdAt: refund.createdAt,
          updatedAt: refund.updatedAt
        }
      })
    )

    const responseSort = response.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    )

    // const io = getSocket()
    // io.emit('refund/all', {});

    res.status(200).json({
      status: 200,
      message: 'Successful!',
      data: responseSort
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getDetail = async (req, res) => {
  try {
    const { orderId } = req.params

    if (!orderId) {
      return res.status(400).json({
        status: 400,
        message: 'orderId is required!'
      })
    }

    const channel = req.headers['x-channel']
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)

    const refund = await Refund.findOne({ orderId }).lean()
    if (!refund) {
      return res.status(404).json({ status: 404, message: 'Refund not found!' })
    }

    const order = await Order.findOne({
      reference: refund.orderId,
      type: 'change'
    }).lean()

    const listProductRefund = refund.listProduct.map(product => ({
      id: product.id,
      name: product.name,
      group: product.group,
      brand: product.brand,
      size: product.size,
      flavour: product.flavour,
      qty: product.qty,
      unit: product.unit,
      unitName: product.unitName,
      price: product.price,
      netTotal: product.total,
      condition: product.condition,
      expireDate: product.expireDate
    }))

    const listProductChange = order
      ? order.listProduct.map(product => ({
          id: product.id,
          name: product.name,
          group: product.group,
          brand: product.brand,
          size: product.size,
          flavour: product.flavour,
          qty: product.qty,
          unit: product.unit,
          unitName: product.unitName,
          price: product.price,
          netTotal: product.netTotal
        }))
      : []

    const totalChange = order ? order.total : 0
    const totalChangeExVat = parseFloat((totalChange / 1.07).toFixed(2))
    const totalChangeVat = parseFloat(
      (totalChange - totalChangeExVat).toFixed(2)
    )
    const totalRefund = refund.total
    const totalRefundExVat = parseFloat((totalRefund / 1.07).toFixed(2))
    const totalRefundVat = parseFloat(
      (totalRefund - totalRefundExVat).toFixed(2)
    )
    const total = parseFloat((totalChange - totalRefund).toFixed(2))

    // const io = getSocket()
    // io.emit('refund/detail', {});

    res.status(200).json({
      type: refund.type,
      orderId: refund.orderId,
      reference: refund.reference || '',
      sale: refund.sale,
      store: refund.store,
      note: refund.note,
      latitude: refund.latitude,
      longitude: refund.longitude,
      shipping: refund.shipping || { shippingId: '', address: '' },
      status: refund.status,
      listProductRefund,
      listProductChange,
      totalRefundExVat,
      totalRefundVat,
      totalRefund,
      totalChangeExVat,
      totalChangeVat,
      totalChange,
      totalDiff: total,
      paymentMethod: refund.paymentMethod || 'cash',
      paymentStatus: refund.paymentStatus || 'unpaid',
      createdAt: refund.createdAt,
      updatedAt: refund.updatedAt,
      listImage: order ? order.listImage || [] : []
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: 500, message: error.message })
  }
}

exports.addSlip = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { Order } = getModelsByChannel(channel, res, orderModel)

    upload(req, res, async err => {
      if (err) {
        return res.status(400).json({
          status: 400,
          message: 'Error uploading file',
          error: err.message
        })
      }

      const { orderId, type } = req.body
      if (!orderId || !type) {
        return res
          .status(400)
          .json({ status: 400, message: 'orderId and type required!' })
      }

      const order = await Order.findOne({ orderId })
      if (!order) {
        return res
          .status(404)
          .json({ status: 404, message: 'Order not found!' })
      }

      if (!req.file) {
        return res
          .status(400)
          .json({ status: 400, message: 'No images uploaded!' })
      }

      const basePath = path.join(__dirname, '../../public/images')
      const uploadedImage = await uploadFiles(
        [req.file],
        basePath,
        type,
        order.orderId
      )

      order.listImage = [
        {
          name: uploadedImage[0].name,
          path: uploadedImage[0].path,
          type: type
        }
      ]

      await order.save()

      const io = getSocket()
      io.emit('refund/addSlip', {
        status: 200,
        message: 'Images uploaded successfully!',
        data: order.listImage
      })

      res.status(200).json({
        status: 200,
        message: 'Images uploaded successfully!',
        data: order.listImage
      })
    })
  } catch (error) {
    console.error('Error uploading images:', error)
    res
      .status(500)
      .json({ status: 500, message: 'Server error', error: error.message })
  }
}
const orderUpdateTimestamps = {}
exports.updateStatus = async (req, res) => {
  try {
    const { orderId, status, user } = req.body
    const channel = req.headers['x-channel']
    const { ApproveLogs } = getModelsByChannel(channel, res, approveLogModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)

    // ===== debounce ตรงนี้ =====
    const now = Date.now()
    const lastUpdate = orderUpdateTimestamps[orderId] || 0
    const ONE_MINUTE = 60 * 1000

    if (now - lastUpdate < ONE_MINUTE) {
      return res.status(429).json({
        status: 429,
        message:
          'This order was updated less than 1 minute ago. Please try again later!'
      })
    }
    orderUpdateTimestamps[orderId] = now
    // ===== end debounce =====

    const changeOrder = await Order.findOne({ reference: orderId })

    if (!changeOrder) {
      return res.status(404).json({
        status: 404,
        message: 'Not found change Order'
      })
    }

    let statusTH = ''

    if (!orderId || !status) {
      return res.status(400).json({
        status: 400,
        message: 'orderId and status are required!'
      })
    }

    const refundOrder = await Refund.findOne({ orderId })

    if (!refundOrder) {
      return res.status(404).json({
        status: 404,
        message: 'Refund order not found!'
      })
    }

    if (refundOrder.status !== 'pending' && status !== 'canceled') {
      return res.status(400).json({
        status: 400,
        message: 'Cannot update status, refund is not in pending state!'
      })
    }

    const productChange = changeOrder.listProduct.map(u => {
      return {
        id: u.id,
        unit: u.unit,
        qty: u.qty
      }
    })

    const productQty = refundOrder.listProduct.map(u => {
      return {
        id: u.id,
        unit: u.unit,
        qty: u.qty,
        condition: u.condition
      }
    })
    let newOrderId = orderId
    if (status === 'canceled') {
      statusTH = 'ยกเลิก'
      if (!/CC\d+$/.test(changeOrder.orderId)) {
        const baseId = changeOrder.orderId // ล็อกฐานไว้ อย่าไปแก้ค่านี้
        let counter = 1
        newOrderId = `${baseId}CC${counter}`

        // ใช้ exists() เร็วกว่า findOne เมื่อเช็คมี/ไม่มี
        while (await Order.exists({ orderId: newOrderId })) {
          counter += 1
          newOrderId = `${baseId}CC${counter}` // ต่อกับ baseId เสมอ
        }
      }
      for (const item of productChange) {
        const updateResult = await updateStockMongo(
          item,
          changeOrder.store.area,
          changeOrder.period,
          'deleteCart',
          channel,
          res
        )
        if (updateResult) return
      }
      // console.log(newOrderId)
      const updatedOrder = await Order.findOneAndUpdate(
        { reference: orderId },
        { $set: { status, statusTH, orderId: newOrderId } },
        { new: true }
      )
      // console.log(orderId)
    } else if (status === 'reject') {
      statusTH = 'ถูกปฏิเสธ'
      if (!/CC\d+$/.test(changeOrder.orderId)) {
        const baseId = changeOrder.orderId // ล็อกฐานไว้ อย่าไปแก้ค่านี้
        let counter = 1
        newOrderId = `${baseId}CC${counter}`

        // ใช้ exists() เร็วกว่า findOne เมื่อเช็คมี/ไม่มี
        while (await Order.exists({ orderId: newOrderId })) {
          counter += 1
          newOrderId = `${baseId}CC${counter}` // ต่อกับ baseId เสมอ
        }
      }

      // console.log(productChange)
      for (const item of productChange) {
        const updateResult = await updateStockMongo(
          item,
          changeOrder.store.area,
          changeOrder.period,
          'deleteCart',
          channel,
          res
        )
        if (updateResult) return
      }
      const updatedOrder = await Order.findOneAndUpdate(
        { reference: orderId },
        { $set: { status, statusTH, orderId: newOrderId } },
        { new: true }
      )
    } else if (status === 'approved') {
      statusTH = 'อนุมัติ'

      for (const item of productQty) {
        // console.log(item)
        if (item.condition != 'damaged') {
          const updateResult = await updateStockMongo(
            item,
            refundOrder.store.area,
            refundOrder.period,
            'withdraw',
            channel,
            res
          )
          if (updateResult) return
        }
      }

      for (const item of productChange) {
        const updateResult = await updateStockMongo(
          item,
          changeOrder.store.area,
          changeOrder.period,
          'sale',
          channel,
          res
        )
        if (updateResult) return
        // console.log('item', item)
      }
    }

    await Refund.findOneAndUpdate(
      { orderId },
      { $set: { status, statusTH } },
      { new: true }
    )

    await Order.findOneAndUpdate(
      { orderId: refundOrder.reference, type: 'change' },
      { $set: { status, statusTH } },
      { new: true }
    )

    const io = getSocket()
    io.emit('refund/updateStatus', {
      status: 200,
      message: 'Updated status successfully!',
      data: orderId
    })

    await ApproveLogs.create({
      module: 'approveRefund',
      user: user,
      status: status,
      id: orderId
    })

    await ApproveLogs.create({
      module: 'approveChange',
      user: user,
      status: status,
      id: changeOrder.orderId
    })

    res.status(200).json({
      status: 200,
      message: 'Updated status successfully!'
    })
  } catch (error) {
    console.error('Error updating refund status:', error)
    res.status(500).json({ status: 500, message: 'Server error' })
  }
}

exports.deleteRefund = async (req, res) => {
  try {
    const { orderId } = req.body
    const channel = req.headers['x-channel']
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)

    // ตรวจสอบ Refund ก่อน
    const refundExists = await Refund.findOne({ orderId })
    if (!refundExists) {
      return res.status(404).json({
        status: 404,
        message: 'Refund not found'
      })
    }

    // ตรวจสอบ Order ก่อน
    const orderExists = await Order.findOne({
      reference: orderId,
      type: 'change'
    })
    if (!orderExists) {
      return res.status(404).json({
        status: 404,
        message: 'Order (change type) not found'
      })
    }

    // อัปเดต refund
    const refund = await Refund.findOneAndUpdate(
      { orderId },
      { status: 'delete', statusTH: 'ถูกลบ' },
      { new: true }
    )

    // อัปเดต order
    const order = await Order.findOneAndUpdate(
      { reference: orderId, type: 'change' },
      { status: 'delete', statusTH: 'ถูกลบ' },
      { new: true }
    )

    res.status(200).json({
      status: 200,
      message: 'Refund and order marked as deleted successfully!'
      // data: refund,
      // order: order
    })
  } catch (error) {
    console.error('Error updating refund status:', error)
    res.status(500).json({ status: 500, message: 'Server error' })
  }
}

exports.cancelApproveRefund = async (req, res) => {
  try {
    const { orderId, status, user } = req.body
    if (!orderId || !status) {
      return res
        .status(400)
        .json({ status: 400, message: 'orderId and status are required!' })
    }

    const channel = req.headers['x-channel']
    const { ApproveLogs } = getModelsByChannel(channel, res, approveLogModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)

    const changeOrder = await Order.findOne({ reference: orderId })
    if (!changeOrder) {
      return res
        .status(404)
        .json({ status: 404, message: 'Not found change Order' })
    }

    const refundOrder = await Refund.findOne({ orderId })
    if (!refundOrder) {
      return res
        .status(404)
        .json({ status: 404, message: 'Refund order not found!' })
    }

    if (refundOrder.status !== 'pending' && status !== 'canceled') {
      return res.status(400).json({
        status: 400,
        message: 'Cannot update status, refund is not in pending state!'
      })
    }

    let statusTH = ''
    if (status === 'canceled') statusTH = 'ยกเลิก'
    else if (status === 'reject') statusTH = 'ถูกปฏิเสธ'

    let newOrderId = orderId
    if (status === 'canceled' || status === 'reject') {
      newOrderId = changeOrder.orderId
      if (!/CC\d+$/.test(changeOrder.orderId)) {
        const baseId = changeOrder.orderId // ล็อกฐานไว้ อย่าไปแก้ค่านี้
        let counter = 1
        newOrderId = `${baseId}CC${counter}`

        // ใช้ exists() เร็วกว่า findOne เมื่อเช็คมี/ไม่มี
        while (await Order.exists({ orderId: newOrderId })) {
          counter += 1
          newOrderId = `${baseId}CC${counter}` // ต่อกับ baseId เสมอ
        }
      }

      for (const item of changeOrder.listProduct) {
        const hasError = await updateStockMongo(
          { id: item.id, unit: item.unit, qty: item.qty },
          changeOrder.store.area,
          changeOrder.period,
          'orderCanceled',
          channel,
          res
        )
        if (hasError) {
          return res
            .status(500)
            .json({ status: 500, message: 'Stock update error' })
        }
      }

      for (const item of refundOrder.listProduct) {
        if (item.condition === 'good') {
          const hasError = await updateStockMongo(
            { id: item.id, unit: item.unit, qty: item.qty },
            refundOrder.store.area,
            refundOrder.period,
            'reduceWithdraw',
            channel,
            res
          )

          if (hasError) {
            return res
              .status(500)
              .json({ status: 500, message: 'Stock update error' })
          }
        }
      }
    }

    await Refund.findOneAndUpdate(
      { orderId },
      { $set: { status, statusTH } },
      { new: true }
    )
    const updatedOrder = await Order.findOneAndUpdate(
      { reference: orderId },
      { $set: { status, statusTH, orderId: newOrderId } },
      { new: true }
    )

    const io = getSocket()
    io.emit('refund/updateStatus', {
      status: 200,
      message: 'Updated status successfully!',
      data: orderId
    })

    await ApproveLogs.create({
      module: 'approveRefund',
      user,
      status,
      statusTH,
      id: orderId
    })
    await ApproveLogs.create({
      module: 'approveChange',
      user,
      status,
      statusTH,
      id: newOrderId
    })

    res
      .status(200)
      .json({ status: 200, message: 'Updated status successfully!' })
  } catch (error) {
    console.error('Error updating refund status:', error)
    res.status(500).json({ status: 500, message: 'Server error' })
  }
}

exports.updateAddressChange = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Store, TypeStore } = getModelsByChannel(channel, res, storeModel)

    const changeData = await Order.find({ type: 'change' })
    const storeId = [...new Set(changeData.flatMap(item => item.store.storeId))]

    const storeData = await Store.find({ storeId: { $in: storeId } })

    for (i of changeData) {
      const store = storeData.find(item => item.storeId === i.store.storeId)

      // console.log(store.storeId)

      const shipping = store.shippingAddress[0]

      await Order.findOneAndUpdate(
        { orderId: i.orderId }, // filter
        {
          $set: {
            shipping: {
              default: shipping?.default ?? '',
              shippingId: shipping?.shippingId ?? '',
              address: shipping?.address ?? '',
              district: shipping?.district ?? '',
              subDistrict: shipping?.subDistrict ?? '',
              province: shipping?.province ?? '',
              postCode: shipping?.postCode ?? '',
              latitude: shipping?.latitude ?? '0',
              longtitude: shipping?.longtitude ?? '0'
            }
          }
        },
        { new: true } // options: คืนค่าที่อัปเดตแล้ว
      )
    }

    res.status(200).json({
      status: 200,
      message: 'Updated status successfully!',
      // storeId,
      data: changeData
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
