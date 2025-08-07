// const {
//   Stock,
//   StockMovement,
//   StockMovementLog
// } = require('../../models/cash/stock')
// const { User } = require('../../models/cash/user')
// const { Product } = require('../../models/cash/product')
const { rangeDate } = require('../../utilities/datetime')
const xlsx = require('xlsx')
const { generateStockId } = require('../../utilities/genetateId')
const path = require('path')
const errorEndpoint = require('../../middleware/errorEndpoint')
const currentFilePath = path.basename(__filename)
const { getStockAvailable } = require('./available')
const { getStockMovement } = require('../../utilities/movement')
const { Warehouse, Locate, Balance } = require('../../models/cash/master')
const { Op } = require('sequelize')
const fs = require('fs')
// const { Refund } = require('../../models/cash/refund')
const {
  stockQuery,
  withdrawQuery
} = require('../../controllers/queryFromM3/querySctipt')
const userModel = require('../../models/cash/user')
const distributionModel = require('../../models/cash/distribution')
const productModel = require('../../models/cash/product')
const stockModel = require('../../models/cash/stock')
const giveModel = require('../../models/cash/give')
const orderModel = require('../../models/cash/sale')
const cartModel = require('../../models/cash/cart')
const refundModel = require('../../models/cash/refund')
const adjustStockModel = require('../../models/cash/stock')
const { getModelsByChannel } = require('../../middleware/channel')
const os = require('os')
const { summaryOrder } = require('../../utilities/summary')
const { to2, updateStockMongo } = require('../../middleware/order')
const { getSocket } = require('../../socket')
const fetchArea = async warehouse => {
  try {
    const WarehouseData = await Warehouse.findAll({
      where: {
        coNo: 410,
        warehouse: warehouse
      }
    })

    const warehouses = []

    WarehouseData.forEach(warehouseInstance => {
      // เข้าถึง dataValues ของแต่ละอินสแตนซ์
      const warehouse = warehouseInstance.dataValues

      // พิมพ์ข้อมูลจาก dataValues
      warehouses.push(warehouse)
    })

    // แปลงข้อมูล warehouse ให้เป็น areaData
    const areaData = warehouses.map(warehouse => {
      // ใช้ RegEx เพื่อตรวจจับแค่ 2 ตัวแรก A-Z และ 3 ตัวหลัง 0-9
      const area = String(warehouse.warehouseName)
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 5) // ลบทุกตัวที่ไม่ใช่ A-Z และ 0-9

      // ตรวจสอบว่าได้รูปแบบที่ถูกต้อง A-Z 2 ตัวแรก + 0-9 3 ตัวหลัง
      const validArea = /^([A-Z]{2})(\d{3})$/.test(area) ? area : null

      return {
        coNo: warehouse.coNo,
        warehouse: warehouse.warehouse,
        warehouseName: warehouse.warehouseName,
        area: validArea // หาก valid จะเป็นค่าที่ได้ หากไม่ตรงเงื่อนไขจะเป็น null
      }
    })

    // กรองข้อมูลที่ area ไม่เป็น null (หมายความว่าตรงตามเงื่อนไข)
    const filteredAreaData = areaData.filter(item => item.area !== null)

    return filteredAreaData
  } catch (error) {
    // Enhanced error handling
    throw errorEndpoint(currentFilePath, 'fetchArea', error)
  }
}

exports.getAdjustStockDetail = async (req, res) => {
  try {
    const { orderId, withdrawId } = req.query

    const channel = req.headers['x-channel']
    const { AdjustStock } = getModelsByChannel(channel, res, adjustStockModel)

    // if (!orderId) {
    //   return res
    //     .status(400)
    //     .json({ status: 400, message: 'orderId is required!' })
    // }

    let order = []

    if (withdrawId) {
      order = await AdjustStock.find({ withdrawId })
    } else {
      order = await AdjustStock.find({ orderId })
    }

    if (order.length === 0) {
      return res
        .status(404)
        .json({ status: 404, message: 'AdjustStock order not found!' })
    }

    const data = order.map(u => {
      return {
        type: u.type,
        orderId: u.orderId,
        withdrawId: u.withdrawId,
        type: u.type,
        area: u.area,
        saleCode: u.saleCode,
        period: u.period,
        status: u.status,
        statusTH: u.statusTH,
        note: u.note,
        listProduct: u.listProduct.map(p => {
          return {
            id: p.id,
            name: p.name,
            qty: p.qty,
            unit: p.unit,
            price: p.price,
            qtyPcs: p.qtyPcs,
            discount: p.discount,
            price: p.price,
            action: p.action
          }
        })
      }
    })

    // const io = getSocket()
    // io.emit('stock/getAdjustStockDetail', {});

    res.status(200).json({
      status: 200,
      message: 'successful!',
      data: data
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getAdjustStock = async (req, res) => {
  try {
    const { type, zone, team, area, period } = req.query
    const channel = req.headers['x-channel']
    const { AdjustStock } = getModelsByChannel(channel, res, adjustStockModel)
    let response = []
    if (!type || !period) {
      return res
        .status(400)
        .json({ status: 400, message: 'type,  period are required!' })
    }
    let areaQuery = {}

    if (zone) {
      areaQuery.zone = { $regex: `^${zone}`, $options: 'i' }
    }

    if (area) {
      areaQuery.area = { $regex: `^${area}`, $options: 'i' }
    }

    let query = {
      type,
      ...areaQuery,
      // 'store.area': area,
      // createdAt: { $gte: startDate, $lt: endDate }
      period: period
    }

    const pipeline = [
      {
        $match: {
          status: 'pending'
        }
      },
      {
        $addFields: {
          zone: { $substrBytes: ['$area', 0, 2] },
          team3: {
            $concat: [
              { $substrCP: ['$area', 0, 2] },
              { $substrCP: ['$area', 3, 1] }
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
        $sort: { createdAt: -1 }
      }
    )

    const adjustStock = await AdjustStock.aggregate(pipeline)

    if (!adjustStock || adjustStock.length === 0) {
      return res.status(404).json({
        status: 404,
        message: 'No orders found!',
        data: []
      })
    }

    response = adjustStock.map(o => ({
      orderId: o.orderId,
      area: o.area,
      saleCode: o.saleCode,
      period: o.period,
      listProduct: o.listProduct,
      statusTH: o.statusTH,
      status: o.status,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt
    }))

    // const io = getSocket()
    // io.emit('stock/adjuststock', {});

    res.status(200).json({
      status: 200,
      message: 'Successful!',
      data: response
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.addStock = async (req, res) => {
  try {
    const body = req.body
    const channel = req.headers['x-channel']

    const { User } = getModelsByChannel(channel, res, userModel)
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Stock } = getModelsByChannel(channel, res, stockModel)

    if (!Array.isArray(body)) {
      return res
        .status(400)
        .json({ status: 400, message: 'Invalid format: expected an array' })
    }

    let createdStocks = []

    for (const item of body) {
      const { area, period, listProduct } = item
      if (!area || !Array.isArray(listProduct)) continue

      const user = await User.findOne({ area }).select('saleCode').lean()
      if (!user) continue

      const saleCode = user.saleCode
      let enrichedListProduct = []

      for (const productEntry of listProduct) {
        const { productId, available } = productEntry
        const productInfo = await Product.findOne({ id: productId }).lean()
        if (!productInfo) continue

        enrichedListProduct.push({
          productId,
          productName: productInfo.name || '',
          productGroup: productInfo.group || '',
          productFlavour: productInfo.flavour || '',
          productSize: productInfo.size || '',
          available: Array.isArray(available) ? available : []
        })
      }

      if (enrichedListProduct.length > 0) {
        const stockDoc = new Stock({
          area,
          saleCode,
          period,
          listProduct: enrichedListProduct
        })
        await stockDoc.save()
        createdStocks.push(stockDoc)
      }
    }

    // emit socket event ถ้ามีรายการถูกเพิ่ม
    if (createdStocks.length > 0) {
      const io = getSocket()
      io.emit('stock/added', {
        count: createdStocks.length,
        data: createdStocks
      })
      return res.status(200).json({
        status: 200,
        message: 'Stock added',
        data: createdStocks
      })
    } else {
      return res
        .status(400)
        .json({ status: 400, message: 'No stock was added' })
    }
  } catch (error) {
    console.error('Error adding stock:', error)
    res.status(500).json({ status: 500, message: error.message })
  }
}

exports.available = async (req, res) => {
  try {
    const { area, period } = req.query
    const channel = req.headers['x-channel']

    const data = await getStockAvailable(area, period, channel, res)
    res.status(200).json({
      status: 200,
      message: 'successfully',
      data: data
    })
  } catch (error) {
    console.error('Error available stock:', error)
    res.status(500).json({ status: 500, message: error.message })
  }
}

exports.transaction = async (req, res) => {
  try {
    const { area, period } = req.query
    const channel = req.headers['x-channel']
    const movement = await getStockMovement(area, period, channel, res)
    res.status(200).json({
      status: 200,
      message: 'successfully!',
      data: movement
    })
  } catch (error) {
    console.error('Error updating order:', error)
    res.status(500).json({ status: 500, message: 'Server error' })
  }
}

exports.addStockNew = async (req, res) => {
  // try {
  const { period } = req.body

  const channel = req.headers['x-channel']

  const { User } = getModelsByChannel(channel, res, userModel)
  const { Stock } = getModelsByChannel(channel, res, stockModel)
  const { Product } = getModelsByChannel(channel, res, productModel)

  const locateData = {}
  const factorData = {}

  const users = await User.find().select('area saleCode warehouse').lean()
  test = []
  // console.log("users",users)
  for (const user of users) {
    const stock = await Stock.findOne({
      area: user.area,
      period: period
    })
      .select('area')
      .lean()

    if (!stock) {
      const areaData = await fetchArea(user.warehouse)
      // console.log("areaData",areaData)
      const BalanceData = await Balance.findAll({
        where: {
          warehouse: user.warehouse,
          coNo: 410,
          // itemCode: '10010601011'
          itemCode: {
            [Op.or]: [
              { [Op.ne]: null },
              { [Op.ne]: '' },
              // { [Op.eq]: "600102390" },
              { [Op.notLike]: 'ZNS%' },
              { [Op.notLike]: '800%' },
              { [Op.notLike]: 'PRO%' },
              { [Op.notLike]: 'DIS%' },
              { [Op.notLike]: '100            ' }
            ]
          }
        }
        // limit: 10
      })
      for (let i = 0; i < BalanceData.length; i++) {
        locateData[BalanceData[i].itemCode.trim()] = []
        factorData[BalanceData[i].itemCode.trim()] = []
        // console.log(`BalanceData[${i}].itemCode`, BalanceData[i].itemCode)
        // console.log('locateData[BalanceData[i].itemCode.trim()]', locateData)
        const locate = await Locate.findAll({
          where: {
            warehouse: user.warehouse,
            itemCode: BalanceData[i].itemCode.trim(),
            coNo: 410
          }
          // limit: 10
        })

        for (let j = 0; j < locate.length; j++) {
          locateData[BalanceData[i].itemCode.trim()].push({
            location: locate[j].location.trim(),
            lot: locate[j].lot,
            itemOnHand: locate[j].itemOnHand,
            itemallocated: locate[j].itemallocated // Assuming promotionName is a property of PromotionData
          })
        }
      }

      const stocks = BalanceData.map(stock => {
        const locate = locateData[stock.itemCode.trim()] || []
        const itemCode = stock.itemCode.trim()

        return {
          coNo: stock.coNo,
          warehouse: stock.warehouse,
          itemCode: itemCode,
          itemPcs: stock.itemPcs,
          allocateMethod: stock.allocateMethod,
          itemallocated: stock.itemallocated,
          itemAllowcatable: stock.itemAllowcatable,
          lot: locate
        }
      })

      const productIds = stocks.map(item => item.itemCode)

      // console.log("productIds",productIds)
      const productDetail = await Product.find({
        id: { $in: productIds }
      }).select('id listUnit.unit listUnit.factor')

      const productFactors = productDetail.map(product => {
        const ctnUnit = product.listUnit.find(unit => unit.unit === 'CTN')
        return {
          id: product.id,
          factor: ctnUnit ? parseInt(ctnUnit.factor) : 0 // หรือ default ค่าอื่นเช่น 1
        }
      })
      data = []

      if (areaData) {
        areaData.forEach(area => {
          // console.log("test")
          const productID = stocks.filter(
            item =>
              item.warehouse === area.warehouse &&
              Array.isArray(item.lot) &&
              item.lot.length > 0
          )

          let listProduct = []

          if (productID.length > 0) {
            listProduct = productID.map(product => {
              const productId = product.itemCode
              // console.log("product",product)
              const Factor =
                productFactors.find(pf => pf.id === productId) || {}
              const sumQtyPcs = product.lot.reduce(
                (sum, obj) => sum + (obj.itemOnHand || 0),
                0
              ) // ตรงนี้คุณเขียน obj.lot.itemOnHand แต่จริงๆ obj คือ lot แล้ว
              const sumQtyCtn = product.lot.reduce(
                (sum, obj) =>
                  sum +
                  (Factor?.factor && Factor.factor > 0
                    ? Math.floor(obj.itemOnHand / Factor.factor) // ใช้ obj แทน lot
                    : 0),
                0
              )

              lotList = product.lot.map(lot => ({
                location: lot.location,
                lot: lot.lot,
                qtyPcs: lot.itemOnHand,
                qtyCtn:
                  Factor?.factor && Factor.factor > 0
                    ? Math.floor(lot.itemOnHand / Factor.factor)
                    : 0
              }))

              return {
                productId: productId,
                sumQtyPcs: sumQtyPcs,
                sumQtyCtn: sumQtyCtn,
                available: lotList
              }
            })
          } else {
            console.log(test)
          }

          data.push({
            area: area.area,
            saleCode: user.saleCode || 'Null',
            period: period,
            warehouse: area.warehouse,
            listProduct: listProduct
          })
          // console.log(test.push(data))
        })
      }
      await Stock.insertMany(data)
    }
  }

  // const warehouse = '213'

  res.status(200).json({
    status: 200,
    message: 'Stock added successfully'
    // data: test
  })
}

exports.getStock = async (req, res, next) => {
  try {
    const { area, period } = req.query
    const channel = req.headers['x-channel']

    const { Stock } = getModelsByChannel(channel, res, stockModel)

    const data = await Stock.find({
      area: area,
      period: period
    })
    if (!data) {
      res.status(404).json({
        status: 404,
        message: 'Not Found Data',
        data: data
      })
    }

    // const io = getSocket()
    // io.emit('stock/', {});

    res.status(200).json({
      status: 200,
      message: 'successfully!',
      data: data
    })
  } catch (error) {
    console.log('Error in getStock', error)
  }
}
exports.getQty = async (req, res, next) => {
  try {
    const { area, productId, unit, period } = req.body
    const channel = req.headers['x-channel']

    const { Stock } = getModelsByChannel(channel, res, stockModel)
    const { Product } = getModelsByChannel(channel, res, productModel)

    // Find product
    const product = await Product.findOne({ id: productId }).lean()

    if (!product) {
      return res.status(404).json({
        status: 404,
        message: 'Not Found This ItemId in Product collection'
      })
    }

    const unitData = product.listUnit.map(unit => ({
      unit: unit.unit,
      factor: unit.factor
    }))

    const unitMatch = product.listUnit.find(u => u.unit === unit)
    const factor = unitMatch?.factor ?? 0

    if (!factor || factor <= 0) {
      return res.status(400).json({
        status: 400,
        message: `Invalid or missing factor for unit "${unit}"`
      })
    }

    // Find stock entries
    const stockEntries = await Stock.find({
      area,
      period,
      'listProduct.productId': productId
    })

    const stockmatchList = []

    stockEntries.forEach(item => {
      const match = item.listProduct.find(p => p.productId === productId)
      if (match) stockmatchList.push(match)
    })

    if (!stockmatchList.length) {
      return res.status(404).json({
        status: 404,
        message: 'Not Found This ItemId in Stock collection'
      })
    }

    // Sum balancePcs
    const totalBalancePcs = stockmatchList.reduce(
      (sum, item) => sum + (item.balancePcs ?? 0),
      0
    )

    const qtyByUnit = Math.floor(totalBalancePcs / factor)

    const data = {
      area,
      productId,
      unit,
      factor,
      sumQtyPcs: totalBalancePcs,
      qty: qtyByUnit,
      unitData
    }

    // const io = getSocket()
    // io.emit('stock/get', {});

    return res.status(200).json({
      status: 200,
      message: 'Stock Quantity fetched successfully!',
      data
    })
  } catch (error) {
    console.error('[getQty error]', error)
    return res.status(500).json({
      status: 500,
      message: 'Internal server error: ' + error.message
    })
  }
}

// check updateStockMovement
exports.addStockMovement = async (req, res, next) => {
  try {
    const {
      orderId,
      area,
      saleCode,
      period,
      warehouse,
      status,
      product,
      action
    } = req.body

    const channel = req.headers['x-channel']

    const { StockMovement } = getModelsByChannel(channel, res, stockModel)

    let movement = await StockMovement.findOne({
      action,
      area,
      period
    })

    // console.log(movement)
    if (!movement) {
      const newStockMovement = new StockMovement({
        orderId,
        area,
        saleCode,
        period,
        warehouse,
        status,
        product,
        action
      })
      newStockMovement.save()

      const io = getSocket()
      io.emit('stock/addStockMovement', {})

      res.status(200).json({
        status: 200,
        message: 'Stock Movement added successfully!'
      })
    } else {
      return res.status(409).json({
        status: 409,
        message: 'action, area, period already in database'
      })
    }
  } catch (error) {
    next(error)
  }
}

exports.updateStockMovement = async (req, res, next) => {
  try {
    const { action } = req.body

    const channel = req.headers['x-channel']

    const { StockMovement, StockMovementLog } = getModelsByChannel(
      channel,
      res,
      stockModel
    )

    let movement = await StockMovement.find({}).select(
      '_id orderId area saleCode period warehouse status action'
    )
    // console.log(movement)

    await StockMovementLog.insertMany(movement)

    await StockMovement.updateMany(
      {}, // เงื่อนไข
      { $set: { action: action } } // สิ่งที่ต้องการอัปเดต
    )

    const io = getSocket()
    io.emit('stock/updateStockMovement', {})

    res.status(200).json({
      status: 200,
      // data:"Update Status Successful!"
      data: movement
    })
  } catch (error) {
    next(error)
  }
}

exports.availableStock = async (req, res, next) => {
  try {
    const { area, period, type, group, brand, size, flavour } = req.body

    const channel = req.headers['x-channel']
    const { Stock } = getModelsByChannel(channel, res, stockModel)
    const { Product } = getModelsByChannel(channel, res, productModel)

    const modelStock = await Stock.aggregate([
      {
        $match: {
          area: area,
          period: period
          // type: type
        }
      },
      {
        $unwind: {
          path: '$listProduct',
          preserveNullAndEmptyArrays: true
        }
      },

      {
        $project: {
          productId: '$listProduct.productId',
          available: '$listProduct.available',
          _id: 0
        }
      }
    ])
    // console.log("modelStock",modelStock)

    if (modelStock.length == 0) {
      return res.status(404).json({
        status: 404,
        message: 'Not Found Stock'
      })
    }
    const productIds = modelStock.flatMap(item => item.productId)

    if (!type || !['sale', 'refund', 'withdraw'].includes(type)) {
      return res.status(400).json({
        status: '400',
        message: 'Invalid type! Required: sale, refund, or withdraw.'
      })
    }

    let filter = {}

    if (type === 'sale') filter.statusSale = 'Y'
    if (type === 'refund') filter.statusRefund = 'Y'
    if (type === 'withdraw') filter.statusWithdraw = 'Y'

    const parseArrayParam = param => {
      if (!param) return []
      try {
        return typeof param === 'string' ? JSON.parse(param) : param
      } catch (error) {
        return param.split(',')
      }
    }

    const groupArray = parseArrayParam(group)
    const brandArray = parseArrayParam(brand)
    const sizeArray = parseArrayParam(size)
    const flavourArray = parseArrayParam(flavour)

    let conditions = []
    if (productIds.length) conditions.push({ id: { $in: productIds } })
    if (groupArray.length) conditions.push({ groupCode: { $in: groupArray } })
    if (brandArray.length) conditions.push({ brandCode: { $in: brandArray } })
    if (sizeArray.length) conditions.push({ size: { $in: sizeArray } })
    if (flavourArray.length)
      conditions.push({ flavourCode: { $in: flavourArray } })

    if (conditions.length) filter.$and = conditions

    // console.log("productIds",productIds)

    let products = await Product.find(filter).lean()

    if (!products.length) {
      return res
        .status(404)
        .json({ status: '404', message: 'No products found!' })
    }

    // console.log(products)

    const data = products.map(product => {
      const lot = modelStock.find(u => u.productId == product.id)

      // console.log('lot', lot)
      const tranFromProduct = product
        ? {
          // ...product,
          _id: product._id,
          id: product.id,
          name: product.name,
          group: product.group,
          groupCode: product.groupCode,
          brandCode: product.brandCode,
          brand: product.brand,
          size: product.size,
          flavourCode: product.flavourCode,
          flavour: product.flavour,
          type: product.type,
          weightGross: product.weightGross,
          weightNet: product.weightNet,
          statusSale: product.statusSale,
          statusWithdraw: product.statusWithdraw,
          statusRefund: product.statusRefund,
          image: product.image,

          listUnit: product.listUnit.map(unit => {
            // console.log("lot",lot)
            // const totalQtyPcsToCtn = Math.floor(
            //   lot.available.reduce((sum, item) => {
            //     return sum + (parseFloat(item.qtyPcs) || 0) / unit.factor
            //   }, 0)
            // )
            if (unit.unit == 'CTN') {
              qty = lot.available.reduce((total, u) => total + u.qtyCtn, 0)
            } else if (unit.unit == 'PCS') {
              qty = lot.available.reduce((total, u) => total + u.qtyPcs, 0)
            } else {
              qty = 0
            }

            return {
              unit: unit.unit,
              name: unit.name,
              factor: unit.factor,
              // qty: totalQtyPcsToCtn,

              qty: qty,
              price: {
                sale: unit.price.sale,
                Refund: unit.price.refund
              }
            }
          }),
          created: product.created,
          updated: product.updated,
          __v: product.__v
        }
        : null

      // console.log(lot)

      if (lot && Array.isArray(lot.available)) {
        const total = lot.available.reduce(
          (acc, order) => {
            acc.totalQtyPcs += order.qtyPcs || 0
            acc.totalQtyCtn += order.qtyCtn || 0
            return acc
          },
          { totalQtyPcs: 0, totalQtyCtn: 0 }
        )

        return {
          ...tranFromProduct,
          totalQtyPcs: total.totalQtyPcs,
          totalQtyCtn: total.totalQtyCtn
        }
      }

      return {
        ...tranFromProduct,
        lot: { totalQtyPcs: 0, totalQtyCtn: 0 }
      }
    })

    function parseSize(sizeStr) {
      if (!sizeStr) return 0

      const units = {
        KG: 1000,
        G: 1,
        L: 1000,
        ML: 1
      }

      const match = sizeStr
        .trim()
        .toUpperCase()
        .match(/^([\d.]+)\s*(KG|G|L|ML)$/)
      if (!match) return 0

      const value = parseFloat(match[1])
      const unit = match[2]

      return units[unit] ? value * units[unit] : 0
    }

    const groupMap = {}
    data.forEach(item => {
      const group = item.group
      if (!groupMap[group]) groupMap[group] = []
      groupMap[group].push(item)
    })

    const groupList = Object.entries(groupMap).map(([group, items]) => {
      const maxSize = Math.max(...items.map(i => parseSize(i.size)))
      return { group, items, maxSize }
    })

    groupList.sort((a, b) => b.maxSize - a.maxSize)

    groupList.forEach(g => {
      g.items.sort((a, b) => parseSize(b.size) - parseSize(a.size))
    })

    const sorted = groupList.flatMap(g => g.items)


    // const io = getSocket()
    // io.emit('stock/availableStock', {});


    res.status(200).json({
      status: 200,
      message: 'Success',
      data: sorted
    })
  } catch (error) {
    next(error)
  }
}

exports.addStockFromERP = async (req, res) => {
  const { period } = req.body
  const channel = req.headers['x-channel']
  const data = await stockQuery(channel, period)
  // console.log(data)
  const cleanPeriod = period.replace('-', '') // "202506"
  const { User } = getModelsByChannel(channel, res, userModel)
  const { Stock } = getModelsByChannel(channel, res, stockModel)
  const { Product } = getModelsByChannel(channel, res, productModel)

  const users = await User.find({ role: 'sale' })
    .select('area saleCode warehouse')
    .lean()

  const productId = data.flatMap(item => item.ITEM_CODE)

  const factorCtn = await Product.aggregate([
    {
      $match: {
        id: { $in: productId }
      }
    },
    {
      $project: {
        id: 1,
        listUnit: {
          $arrayElemAt: [
            {
              $filter: {
                input: '$listUnit',
                as: 'unit',
                cond: { $eq: ['$$unit.unit', 'CTN'] }
              }
            },
            0
          ]
        }
      }
    }
  ])

  const result = []

  for (const item of users) {

    const datastock = data.filter(i => i.WH == item.warehouse)
    // console.log("datastock",datastock)
    // console
    const existingStock = await Stock.findOne({
      area: item.area,
      period: cleanPeriod,
      warehouse: item.warehouse
    })

    if (existingStock) {
      continue
    }

    const record = {
      area: item.area,
      saleCode: item.saleCode,
      period: cleanPeriod,
      warehouse: item.warehouse,
      listProduct: datastock.map(stock => {
        const ctn = factorCtn.find(i => i.id === stock.ITEM_CODE) || {}
        const factor = Number(ctn?.listUnit?.factor)
        const qtyCtn = factor > 0 ? Math.floor(stock.ITEM_QTY / factor) : 0
        return {
          productId: stock.ITEM_CODE,
          stockPcs: stock.ITEM_QTY,
          stockInPcs: 0,
          stockOutPcs: 0,
          balancePcs: stock.ITEM_QTY,
          stockCtn: qtyCtn,
          stockInCtn: 0,
          stockOutCtn: 0,
          balanceCtn: qtyCtn
        }
      })
    }


    result.push(record)

    const stockDoc = new Stock(record)
    await stockDoc.save()
  }

  const io = getSocket()
  io.emit('stock/addStockFromERP', {})

  res.status(200).json({
    status: 200,
    message: 'addStockFromERP',
    data: result
  })
}

exports.getStockQty = async (req, res) => {
  const { area, period } = req.body
  const channel = req.headers['x-channel']
  const { Stock } = getModelsByChannel(channel, res, stockModel)
  const { Product } = getModelsByChannel(channel, res, productModel)

  let areaQuery = {}
  if (area) {
    if (area.length == 2) {
      areaQuery.zone = area.slice(0, 2)
    } else if (area.length == 5) {
      areaQuery.area = area
    }
  }

  const matchQuery = { ...areaQuery, period }
  const dataStock = await Stock.aggregate([
    {
      $addFields: {
        zone: { $substrBytes: ['$area', 0, 2] }
      }
    },
    { $match: matchQuery },
    {
      $project: {
        listProduct: 1,
        _id: 0
      }
    }
  ])

  if (dataStock.length === 0) {
    return res.status(404).json({
      status: 404,
      message: 'Not found this area'
    })
  }

  const dataStockTran = dataStock
  const productIdList = dataStockTran.flatMap(item =>
    item.listProduct.map(u => u.productId)
  )

  const uniqueProductId = [...new Set(productIdList)]

  // console.log(uniqueProductId)
  const allProducts = dataStockTran.flatMap(item => item.listProduct)

  // 2. รวมยอดแต่ละ field ตาม productId
  const sumById = {} // { productId: { ...sum } }
  for (const u of allProducts) {
    const id = u.productId
    if (!sumById[id]) {
      // clone อันแรก (หรือสร้าง object เปล่า)
      sumById[id] = {
        id: id,
        stockPcs: u.stockPcs || 0,
        stockInPcs: u.stockInPcs || 0,
        stockOutPcs: u.stockOutPcs || 0,
        balancePcs: u.balancePcs || 0,
        stockCtn: u.stockCtn || 0,
        stockInCtn: u.stockInCtn || 0,
        stockOutCtn: u.stockOutCtn || 0,
        balanceCtn: u.balanceCtn || 0
      }
    } else {
      sumById[id].stockPcs += u.stockPcs || 0
      sumById[id].stockInPcs += u.stockInPcs || 0
      sumById[id].stockOutPcs += u.stockOutPcs || 0
      sumById[id].balancePcs += u.balancePcs || 0
      sumById[id].stockCtn += u.stockCtn || 0
      sumById[id].stockInCtn += u.stockInCtn || 0
      sumById[id].stockOutCtn += u.stockOutCtn || 0
      sumById[id].balanceCtn += u.balanceCtn || 0
    }
  }

  const productSum = Object.values(sumById)

  const dataProduct = await Product.find({
    id: { $in: uniqueProductId }
  }).select('id name listUnit')

  let data = []
  let summaryStock = 0
  let summaryStockIn = 0
  let summaryStockOut = 0
  let summaryStockBal = 0

  let summaryStockPcs = 0
  let summaryStockInPcs = 0
  let summaryStockOutPcs = 0
  let summaryStockBalPcs = 0

  for (const stockItem of productSum) {
    const productDetail = dataProduct.find(u => u.id == stockItem.id)
    if (!productDetail) continue

    const pcsMain = stockItem.stockPcs
    let stock = stockItem.stockPcs
    let stockIn = stockItem.stockInPcs
    let stockOut = stockItem.stockOutPcs
    let balance = stockItem.balancePcs
    summaryStockPcs += stockItem.stockPcs || 0
    summaryStockInPcs += stockItem.stockInPcs || 0
    summaryStockOutPcs += stockItem.stockOutPcs || 0
    summaryStockBalPcs += stockItem.balancePcs || 0

    const listUnitStock = productDetail.listUnit.map(u => {
      const sale = u.price.sale
      const factor = u.factor
      const stockQty = Math.floor(stock / factor) || 0
      const stockInQty = Math.floor(stockIn / factor) || 0
      const stockOutQty = Math.floor(stockOut / factor) || 0
      const balanceQty = Math.floor(balance / factor) || 0

      stock -= stockQty * factor
      stockIn -= stockInQty * factor
      stockOut -= stockOutQty * factor
      balance -= balanceQty * factor

      summaryStock += (stockQty || 0) * sale
      summaryStockIn += (stockInQty || 0) * sale
      summaryStockOut += (stockOutQty || 0) * sale
      summaryStockBal += (balanceQty || 0) * sale

      return {
        unit: u.unit,
        unitName: u.name,
        stock: stockQty,
        stockIn: stockInQty,
        stockOut: stockOutQty,
        balance: balanceQty
      }
    })

    const finalProductStock = {
      productId: stockItem.id,
      productName: productDetail.name,
      pcsMain: pcsMain,
      listUnit: listUnitStock
    }

    data.push(finalProductStock)
  }

  // sort และลบ pcsMain ก่อนส่งออก
  data.sort((a, b) => b.pcsMain - a.pcsMain)
  data.forEach(item => {
    delete item.pcsMain
  })

  // const io = getSocket()
  // io.emit('stock/getStockQty', {});

  res.status(200).json({
    status: 200,
    message: 'suceesful',
    data: data,
    summaryStock: Number(summaryStock.toFixed(2)),
    summaryStockIn: Number(summaryStockIn.toFixed(2)),
    summaryStockOut: Number(summaryStockOut.toFixed(2)),
    summaryStockBal: Number(summaryStockBal.toFixed(2)),
    summaryStockPcs: summaryStockPcs,
    summaryStockInPcs: summaryStockInPcs,
    summaryStockOutPcs: summaryStockOutPcs,
    summaryStockBalPcs: summaryStockBalPcs
  })
}

exports.getStockQtyNew = async (req, res) => {
  const { area, period } = req.body
  const channel = req.headers['x-channel']
  const { Stock } = getModelsByChannel(channel, res, stockModel)
  const { Product } = getModelsByChannel(channel, res, productModel)
  const { Refund } = getModelsByChannel(channel, res, refundModel)
  const { AdjustStock } = getModelsByChannel(channel, res, adjustStockModel)
  const { Distribution } = getModelsByChannel(channel, res, distributionModel)
  const { Order } = getModelsByChannel(channel, res, orderModel)
  const { Giveaway } = getModelsByChannel(channel, res, giveModel)

  let areaQuery = {}
  if (area) {
    if (area.length == 2) {
      areaQuery.zone = area.slice(0, 2)
    } else if (area.length == 5) {
      areaQuery.area = area
    }
  }

  let areaQueryRefund = {}
  if (area) {
    if (area.length === 2) {
      areaQueryRefund['store.zone'] = area.slice(0, 2)
    } else if (area.length === 5) {
      areaQueryRefund['store.area'] = area
    }
  }

  const matchQuery = { ...areaQuery, period }

  const matchQueryRefund = { ...areaQueryRefund, period }

  const dataRefund = await Refund.aggregate([
    { $match: matchQueryRefund },
    {
      $project: {
        listProduct: 1,
        _id: 0
      }
    }
  ])

  const dataWithdraw = await Distribution.aggregate([
    {
      $addFields: {
        zone: { $substrBytes: ['$area', 0, 2] }
      }
    },
    { $match: { status: 'confirm' } },
    { $match: matchQuery },
    {
      $project: {
        _id: 0,
        listProduct: {
          $map: {
            input: {
              $filter: {
                input: '$listProduct',
                as: 'item',
                cond: { $gt: ['$$item.receiveQty', 0] }
              }
            },
            as: 'item',
            in: {
              id: '$$item.id',
              name: '$$item.name',
              group: '$$item.group',
              brand: '$$item.brand',
              size: '$$item.size',
              flavour: '$$item.flavour',
              qty: '$$item.receiveQty',
              unit: '$$item.unit',
              qtyPcs: '$$item.qtyPcs',
              price: '$$item.price',
              total: '$$item.total',
              weightGross: '$$item.weightGross',
              weightNet: '$$item.weightNet'
            }
          }
        }
      }
    }
  ])

  // console.log(dataWithdraw)
  // console.log(JSON.stringify(dataWithdraw, null, 2))


  const dataOrder = await Order.aggregate([
    {
      $addFields: {
        zone: { $substrBytes: ['$area', 0, 2] }
      }
    },
    { $match: { type: 'sale', status: { $ne: 'canceled' } } },
    { $match: matchQueryRefund },
    {
      $project: {
        listProduct: 1,
        listPromotions: 1,
        _id: 0
      }
    }
  ])

  const dataChange = await Order.aggregate([
    {
      $addFields: {
        zone: { $substrBytes: ['$area', 0, 2] }
      }
    },
    { $match: { type: 'change' } },
    { $match: matchQueryRefund },
    {
      $project: {
        listProduct: 1,
        _id: 0
      }
    }
  ])

  const dataAdjust = await AdjustStock.aggregate([
    {
      $addFields: {
        zone: { $substrBytes: ['$area', 0, 2] }
      }
    },
    { $match: { type: 'adjuststock' ,status:'approved'} },
    { $match: matchQuery },
    {
      $project: {
        listProduct: 1,
        _id: 0
      }
    }
  ])

  // console.log(dataAdjust)

  const dataGive = await Giveaway.aggregate([
    {
      $addFields: {
        zone: { $substrBytes: ['$area', 0, 2] }
      }
    },
    { $match: { type: 'give', status: { $ne: 'canceled' } } },
    { $match: matchQueryRefund },
    {
      $project: {
        listProduct: 1,
        _id: 0
      }
    }
  ])

  const allWithdrawProducts = dataWithdraw.flatMap(doc => doc.listProduct || [])

  // console.log("allWithdrawProducts", allWithdrawProducts)
  const allRefundProducts = dataRefund.flatMap(doc => doc.listProduct || [])
  const allOrderProducts = dataOrder.flatMap(doc => doc.listProduct || [])
  const allOrderPromotion = dataOrder.flatMap(doc => doc.listPromotions || [])
  const allChangeProducts = dataChange.flatMap(doc => doc.listProduct || [])
  const allAdjustProducts = dataAdjust.flatMap(doc => doc.listProduct || [])
  const allGiveProducts = dataGive.flatMap(doc => doc.listProduct || [])

  // console.log('allOrderPromotion',allOrderPromotion)

  const dataStock = await Stock.aggregate([
    {
      $addFields: {
        zone: { $substrBytes: ['$area', 0, 2] }
      }
    },
    { $match: matchQuery },
    {
      $project: {
        listProduct: 1,
        _id: 0
      }
    }
  ])

  // console.log(dataStock)

  const refundProductArray = Object.values(
    allRefundProducts.reduce((acc, curr) => {
      const key = `${curr.id}_${curr.unit}_${curr.condition}`
      if (acc[key]) {
        acc[key] = {
          ...curr,
          qty: (acc[key].qty || 0) + (curr.qty || 0),
          qtyPcs: (acc[key].qtyPcs || 0) + (curr.qtyPcs || 0)
        }
      } else {
        acc[key] = { ...curr }
      }
      return acc
    }, {})
  )

  // console.log(allWithdrawProducts)

  const withdrawProductArray = Object.values(
    allWithdrawProducts.reduce((acc, curr) => {
      const key = `${curr.id}_${curr.receiveUnit}`;
      if (acc[key]) {
        acc[key] = {
          ...acc[key], // ⬅️ เอาอันเก่ามาเป็นหลัก
          qty: (acc[key].qty || 0) + (curr.qty || 0),
          qtyPcs: (acc[key].qtyPcs || 0) + (curr.qtyPcs || 0)
        };
      } else {
        acc[key] = {
          ...curr,
          qty: curr.qty || 0, // ⬅️ ตั้งต้นจาก receiveQty
          qtyPcs: curr.qtyPcs || 0
        };
      }
      return acc;
    }, {})
  );

  // console.log(withdrawProductArray)

  const orderProductArray = Object.values(
    allOrderProducts.reduce((acc, curr) => {
      const key = `${curr.id}_${curr.unit}`
      if (acc[key]) {
        acc[key] = {
          ...curr,
          qty: (acc[key].qty || 0) + (curr.qty || 0),
          qtyPcs: (acc[key].qtyPcs || 0) + (curr.qtyPcs || 0)
        }
      } else {
        acc[key] = { ...curr }
      }
      return acc
    }, {})
  )

  const mergedProductPromotions = allOrderPromotion.reduce((acc, promo) => {
    promo.listProduct.forEach(prod => {
      const key = `${prod.id}_${prod.unit}`;
      if (acc[key]) {
        acc[key].qty += prod.qty || 0;
        acc[key].qtyPcs += prod.qtyPcs || 0;
      } else {
        acc[key] = {
          ...prod,
          qty: prod.qty || 0,
          qtyPcs: prod.qtyPcs || 0
        };
      }
    });
    return acc;
  }, {});

  // แปลงเป็น array ถ้าต้องการใช้งานต่อ
  const orderPromotionArray = Object.values(mergedProductPromotions);
  // console.log("mergedProductPromotions", JSON.stringify(mergedProductPromotions, null, 2));



  const changeProductArray = Object.values(
    allChangeProducts.reduce((acc, curr) => {
      const key = `${curr.id}_${curr.unit}`
      if (acc[key]) {
        acc[key] = {
          ...curr,
          qty: (acc[key].qty || 0) + (curr.qty || 0),
          qtyPcs: (acc[key].qtyPcs || 0) + (curr.qtyPcs || 0)
        }
      } else {
        acc[key] = { ...curr }
      }
      return acc
    }, {})
  )

  const adjustProductArray = Object.values(
    allAdjustProducts.reduce((acc, curr) => {
      const key = `${curr.id}_${curr.unit}`
      if (acc[key]) {
        acc[key] = {
          ...curr,
          qty: (acc[key].qty || 0) + (curr.qty || 0),
          qtyPcs: (acc[key].qtyPcs || 0) + (curr.qtyPcs || 0)
        }
      } else {
        acc[key] = { ...curr }
      }
      return acc
    }, {})
  )

  // console.log(adjustProductArray)

  const giveProductArray = Object.values(
    allGiveProducts.reduce((acc, curr) => {
      const key = `${curr.id}_${curr.unit}`
      if (acc[key]) {
        acc[key] = {
          ...curr,
          qty: (acc[key].qty || 0) + (curr.qty || 0),
          qtyPcs: (acc[key].qtyPcs || 0) + (curr.qtyPcs || 0)
        }
      } else {
        acc[key] = { ...curr }
      }
      return acc
    }, {})
  )

  if (dataStock.length === 0) {
    return res.status(404).json({
      status: 404,
      message: 'Not found this area'
    })
  }

  const dataStockTran = dataStock
  const productIdListStock = dataStockTran.flatMap(item =>
    item.listProduct.map(u => u.productId)
  )
  const productIdListWithdraw = withdrawProductArray.flatMap(item => item.id)

  const productIdListRefund = refundProductArray.flatMap(item => item.id)

  const productIdListOrder = orderProductArray.flatMap(item => item.id)

  const productIdListPromotion = orderPromotionArray.flatMap(item => item.id)

  const productIdListChange = changeProductArray.flatMap(item => item.id)

  const productIdListAdjust = adjustProductArray.flatMap(item => item.id)

  const productIdListGive = giveProductArray.flatMap(item => item.id)


  // console.log("withdrawProductArray",withdrawProductArray)
  const uniqueProductId = [
    ...new Set([
      ...productIdListStock,
      ...productIdListWithdraw,
      ...productIdListRefund,
      ...productIdListOrder,
      ...productIdListPromotion,
      ...productIdListChange,
      ...productIdListAdjust,
      ...productIdListGive
    ])
  ]

  // console.log(productIdListWithdraw)
  const allProducts = dataStockTran.flatMap(item => item.listProduct)

  const haveProductIdSet = new Set(allProducts.map(p => p.productId))

  uniqueProductId.forEach(productId => {
    if (!haveProductIdSet.has(productId)) {
      // console.log(productId)
      allProducts.push({
        productId,
        stockPcs: 0,
        balancePcs: 0,
        stockCtn: 0,
        balanceCtn: 0
      })
    }
  })

  // 2. รวมยอดแต่ละ field ตาม productId
  const sumById = {} // { productId: { ...sum } }
  for (const u of allProducts) {
    const id = u.productId
    if (!sumById[id]) {
      // clone อันแรก (หรือสร้าง object เปล่า)
      // console.log(id)
      sumById[id] = {
        id: id,
        stockPcs: u.stockPcs || 0,
        balancePcs: u.balancePcs || 0,
        stockCtn: u.stockCtn || 0,
        balanceCtn: u.balanceCtn || 0
      }
    } else {
      sumById[id].stockPcs += u.stockPcs || 0
      sumById[id].balancePcs += u.balancePcs || 0
      sumById[id].stockCtn += u.stockCtn || 0
      sumById[id].balanceCtn += u.balanceCtn || 0
    }
  }

  const productSum = Object.values(sumById)

  // console.log(productSum)

  const dataProduct = await Product.find({
    id: { $in: uniqueProductId }
  }).select('id name listUnit')

  let data = []
  let summaryStock = 0
  let summaryWithdraw = 0
  let summaryGood = 0
  let summaryDamaged = 0
  let summarySale = 0
  let summaryPromotion = 0
  let summaryChange = 0
  let summaryAdjust = 0
  let summaryGive = 0
  let summaryStockBal = 0

  let summaryStockPcs = 0
  // let summaryStockInPcs = 0
  // let summaryStockOutPcs = 0
  let summaryStockBalPcs = 0

  for (const stockItem of productSum) {
    const productDetail = dataProduct.find(u => u.id == stockItem.id)
    const productDetailRufund = refundProductArray.filter(
      u => u.id == stockItem.id
    )
    const productDetailWithdraw = withdrawProductArray.filter(
      u => u.id == stockItem.id
    )
    const productDetailOrder = orderProductArray.filter(
      u => u.id == stockItem.id
    )

    const productDetailPromotion = orderPromotionArray.filter(
      u => u.id == stockItem.id
    )

    const productDetailChange = changeProductArray.filter(
      u => u.id == stockItem.id
    )

    const productDetailAdjust = adjustProductArray.filter(
      u => u.id == stockItem.id
    )
    // console.log(productDetailAdjust)

    const productDetailGive = giveProductArray.filter(u => u.id == stockItem.id)

    if (!productDetail) continue
    if (!productDetailRufund) continue
    if (!productDetailWithdraw) continue
    if (!productDetailOrder) continue
    if (!productDetailChange) continue
    if (!productDetailPromotion) continue
    if (!productDetailAdjust) continue
    if (!productDetailGive) continue

    // let goodqty = productDetailRufund.qtyPcs

    // console.log(productDetailPromotion)

    const pcsMain = stockItem.stockPcs
    let stock = stockItem.stockPcs
    let balance = stockItem.balancePcs
    summaryStockPcs += stockItem.stockPcs || 0
    summaryStockBalPcs += stockItem.balancePcs || 0

    const listUnitStock = productDetail.listUnit.map(u => {
      const goodQty =
        productDetailRufund.find(
          i => i.unit === u.unit && i.condition === 'good'
        )?.qty ?? 0
      const damagedQty =
        productDetailRufund.find(
          i => i.unit === u.unit && i.condition === 'damaged'
        )?.qty ?? 0
      const withdrawQty =
        productDetailWithdraw.find(i => i.unit === u.unit)?.qty ?? 0

      // console.log(productDetailWithdraw)
      const saleQty = productDetailOrder.find(i => i.unit === u.unit)?.qty ?? 0
      const promoQty = productDetailPromotion.find(i => i.unit === u.unit)?.qty ?? 0
      // console.log("promoQty",promoQty)
      const changeQty =
        productDetailChange.find(i => i.unit === u.unit)?.qty ?? 0
      const adjustQty =
        productDetailAdjust.find(i => i.unit === u.unit)?.qty ?? 0
      const giveQty = productDetailGive.find(i => i.unit === u.unit)?.qty ?? 0
      // console.log(goodQty)

      const goodSale = u.price.refund
      const damagedSale = u.price.refundDmg
      const changeSale = u.price.change
      const sale = u.price.sale
      const factor = u.factor
      const stockQty = Math.floor(stock / factor) || 0
      const balanceQty = Math.floor(balance / factor) || 0
      // console.log(goodQty)

      stock -= stockQty * factor
      balance -= balanceQty * factor
      // console.log(withdrawQty)
      summaryStock += (stockQty || 0) * sale
      summaryStockBal += (balanceQty || 0) * sale
      summaryWithdraw += (withdrawQty || 0) * sale
      summaryGood += (goodQty || 0) * goodSale
      summaryDamaged += (damagedQty || 0) * damagedSale
      summarySale += (saleQty || 0) * sale
      summaryPromotion += (promoQty || 0) * sale
      summaryChange += (changeQty || 0) * changeSale
      summaryAdjust += (adjustQty || 0) * sale
      summaryGive += (giveQty || 0) * sale

      return {
        unit: u.unit,
        unitName: u.name,
        stock: stockQty,
        withdraw: withdrawQty,
        good: goodQty,
        damaged: damagedQty,
        sale: saleQty,
        promotion: promoQty,
        change: changeQty,
        adjust: adjustQty,
        give: giveQty,
        balance: balanceQty
      }
    })

    const finalProductStock = {
      productId: stockItem.id,
      productName: productDetail.name,
      pcsMain: pcsMain,
      listUnit: listUnitStock
    }

    data.push(finalProductStock)
  }

  // sort และลบ pcsMain ก่อนส่งออก
  data.sort((a, b) => b.pcsMain - a.pcsMain)
  data.forEach(item => {
    delete item.pcsMain
  })

  // const io = getSocket()
  // io.emit('stock/getStockQtyNew', {});


  res.status(200).json({
    status: 200,
    message: 'suceesful',
    data: data,
    summaryStock: Number(summaryStock.toFixed(2)),
    summaryStockBal: Number(summaryStockBal.toFixed(2)),
    summaryWithdraw: Number(summaryWithdraw.toFixed(2)),
    summaryGood: Number(summaryGood.toFixed(2)),
    summaryDamaged: Number(summaryDamaged.toFixed(2)),
    summarySale: Number(summarySale.toFixed(2)),
    summaryPromotion: Number(summaryPromotion.toFixed(2)),
    summaryChange: Number(summaryChange.toFixed(2)),
    summaryAdjust: Number(summaryAdjust.toFixed(2)),
    summaryGive: Number(summaryGive.toFixed(2)),
    summaryStockPcs: Number(summaryStockPcs.toFixed(2)),
    summaryStockBalPcs: Number(summaryStockBalPcs.toFixed(2))
  })
}

exports.getWeightProduct = async (req, res) => {
  const { area, period } = req.body
  const channel = req.headers['x-channel']
  const { Stock } = getModelsByChannel(channel, res, stockModel)
  const { Product } = getModelsByChannel(channel, res, productModel)

  const stockData = await Stock.aggregate([
    { $match: { area: area, period: period } },
    { $unwind: { path: '$listProduct', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$listProduct.productId',
        totalBalancePcs: { $sum: '$listProduct.balancePcs' }
      }
    }
  ])
  let weightNet = 0
  let weightGross = 0
  if (stockData.length === 0) {
    return res.status(404).json({
      status: 404,
      message: 'Not found stock'
    })
  }

  const productIds = stockData.map(item => item._id)

  const products = await Product.find({ id: { $in: productIds } }).select(
    'id weightGross weightNet'
  )

  const productMap = new Map(products.map(p => [p.id, p]))

  for (const item of stockData) {
    const productDetail = productMap.get(item._id)
    const gross = Number(productDetail?.weightGross) || 0
    const net = Number(productDetail?.weightNet) || 0
    const qty = item.totalBalancePcs || 0

    weightGross += gross * qty
    weightNet += net * qty
  }

  // const io = getSocket()
  // io.emit('stock/getWeightProduct', {});


  res.status(200).json({
    status: 200,
    message: 'suceesful',
    weightNet: Number(weightNet.toFixed(2)),
    weightGross: Number(weightGross.toFixed(2))
  })
}

// exports.rollbackStock = async (req, res, next) => {
//   try {
//     const { orderId, area, saleCode, period, warehouse, status, action } =
//       req.body

//     let movement = await StockMovement.findOne({
//       // action: action,
//       area: area,
//       period: period
//     })

//     for (const item of movement.product) {
//       if (item.unit !== 'PCS') {
//         const productDetail = await Product.findOne({
//           id: item.id,
//           'listUnit.unit': item.unit
//         })
//         item.qty = item.qty * productDetail.listUnit[0].factor
//       }
//       const productCTN = await Product.findOne({
//         id: item.id,
//         'listUnit.unit': 'CTN'
//       })
//       const itemQtyCTN = Math.floor(item.qty / productCTN.listUnit[0].factor)

//       await Stock.findOneAndUpdate(
//         {
//           area: area,
//           'listProduct.productId': item.id,
//           'listProduct.available.lot': item.lot
//         },
//         {
//           $set: {
//             'listProduct.$[i].available.$[j].qtyPcs': item.qty,
//             'listProduct.$[i].available.$[j].qtyCtn': itemQtyCTN
//           }
//         },
//         {
//           arrayFilters: [{ 'i.productId': item.id }, { 'j.lot': item.lot }],
//         }
//       )
//     }
//     // movement.deleteOne({
//     //   // action: action,
//     //   area: area,
//     //   period: period
//     // })
//     res.status(200).json({
//       status: 200,
//       message: 'Rollblack Stock successfully!',
//       data:movement
//     })
//   } catch (error) {
//     next(error)
//   }
// }

const convertToTHTime = dateField => ({
  $dateAdd: {
    startDate: dateField,
    unit: 'hour',
    amount: 7
  }
})

const filterByProductId = (inputExpr, productId) => ({
  $filter: {
    input: inputExpr,
    as: 'item',
    cond: { $eq: [{ $toString: '$$item.id' }, String(productId)] }
  }
});

const calculateQtyByUnit = (unitList, items) =>
  unitList.map(unit => ({
    unit: unit.unit,
    unitName: unit.name,
    qty: items
      .filter(p => p.unit === unit.unit)
      .reduce((sum, p) => sum + (p.qty || 0), 0)
  }))

const calculateTotalPrice = (unitList, stockItems, type = 'sale') =>
  unitList.reduce((sum, unit) => {
    const totalQty = stockItems
      .filter(i => i.unit === unit.unit)
      .reduce((acc, item) => acc + item.qty, 0)
    return sum + totalQty * (unit.price?.[type] || 0)
  }, 0)

const buildStock = (unitList, totalQty, date) => {
  const stock = []
  for (const item of unitList) {
    const factor = Number(item.factor)
    const qty = Math.floor(totalQty / factor)
    totalQty -= qty * factor
    stock.push({ unit: item.unit, unitName: item.name, qty })
  }
  return { stock, date }
}

exports.getStockQtyDetail = async (req, res) => {
  try {
    const { area, productId: rawProductId, period } = req.body;
    const productId = String(rawProductId);
    const channel = req.headers['x-channel'];

    const { Stock, Product, Distribution, Refund, Order, Giveaway } = {
      Stock: getModelsByChannel(channel, res, stockModel).Stock,
      Product: getModelsByChannel(channel, res, productModel).Product,
      Distribution: getModelsByChannel(channel, res, distributionModel).Distribution,
      Refund: getModelsByChannel(channel, res, refundModel).Refund,
      Order: getModelsByChannel(channel, res, orderModel).Order,
      Giveaway: getModelsByChannel(channel, res, giveModel).Giveaway,

    };

    const filterProduct = (list = []) => list.filter(p => p.id === productId);

    const productData = await Product.findOne({ id: productId }).select('id name listUnit');

    const stockDocs = await Stock.aggregate([
      { $match: { area, period } },
      { $unwind: '$listProduct' },
      { $match: { 'listProduct.productId': productId } },
      { $addFields: { createdAtTH: convertToTHTime('$createdAt') } }
    ]);

    const stockInfo = stockDocs[0] || {};
    const STOCK = buildStock(productData.listUnit, stockInfo.listProduct?.stockPcs || 0, stockInfo.createdAtTH);
    const STOCKIN = buildStock(productData.listUnit, stockInfo.listProduct?.stockInPcs || 0);
    const BALANCE = buildStock(productData.listUnit, stockInfo.listProduct?.balancePcs || 0);

    const distributionDocs = await Distribution.aggregate([
      { $match: { area, period } },
      { $match: { status: 'confirm' } },
      { $unwind: '$listProduct' },
      { $match: { 'listProduct.id': productId } },
      { $addFields: { createdAtTH: convertToTHTime('$createdAt') } }
    ]);

    const withdraw = distributionDocs.map(d => ({
      area: d.area,
      orderId: d.orderId,
      orderType: d.orderType,
      orderTypeName: d.orderTypeName,
      sendDate: d.sendDate,
      total: d.listProduct.receiveQty,
      status: d.status
    }));

    const withdrawStock = productData.listUnit.map(unit => ({
      unit: unit.unit,
      unitName: unit.name,
      qty: unit.unit === 'CTN' ? withdraw.reduce((sum, i) => sum + i.total, 0) : 0
    }));

    // console.log(withdrawStock)

    const refundDocs = await Refund.aggregate([
      { $match: { 'store.area': area, period, status: { $ne: 'canceled' } } },
      {
        $addFields: {
          createdAtTH: convertToTHTime('$createdAt'),
          listProduct: {
            $filter: {
              input: '$listProduct',
              as: 'item',
              cond: { $eq: ['$$item.id', productId] }
            }
          }
        }
      },
      { $match: { listProduct: { $ne: [] } } }
    ]);

    const newRefund = await Promise.all(refundDocs.map(async refund => {
      const change = await Order.findOne({ reference: refund.orderId, type: 'change', status: { $ne: 'canceled' } }).select('total').lean();
      return {
        orderId: refund.orderId,
        storeId: refund.store?.storeId || '',
        storeName: refund.store?.name || '',
        storeAddress: refund.store?.address || '',
        totalChange: (change?.total || 0).toFixed(2),
        totalRefund: (refund.total || 0).toFixed(2),
        total: ((change?.total || 0) - (refund.total || 0)).toFixed(2),
        status: refund.status
      };
    }));

    const refundStock = calculateQtyByUnit(productData.listUnit, refundDocs.flatMap(r => r.listProduct));

    const rawOrders = await Order.find({
      'store.area': area,
      period,
      type: 'sale',
      status: { $ne: 'canceled' }
    }).lean();

    const orderSaleDocs = rawOrders
      .map(order => {
        const filteredProduct = filterProduct(order.listProduct);

        const listPromotions = (order.listPromotions || []).map(promo => ({
          ...promo,
          listProduct: filterProduct(promo.listProduct)
        }));

        return {
          ...order,
          listProduct: filteredProduct,
          listPromotions,
          createdAtTH: convertToTHTime(order.createdAt)
        };
      })
      .filter(order =>
        order.listProduct.length > 0 ||
        order.listPromotions.some(promo => promo.listProduct.length > 0)
      );

    const orderDetail = orderSaleDocs.map(o => ({
      orderId: o.orderId,
      storeId: o.store?.storeId || '',
      storeName: o.store?.name || '',
      storeAddress: o.store?.address || '',
      createAt: o.createdAt,
      total: o.total,
      status: o.status,
      statusTH: o.statusTH,
      createdAt: o.createdAt
    }));

    const orderStock = calculateQtyByUnit(productData.listUnit,
      orderSaleDocs.flatMap(o => o.listProduct)
    );

    const promotionStock = calculateQtyByUnit(productData.listUnit,
      orderSaleDocs.flatMap(o =>
        o.listPromotions.flatMap(p => p.listProduct)
      )
    );

    const orderChangeDocs = await Order.aggregate([
      { $match: { 'store.area': area, period, type: 'change', status: { $ne: 'canceled' } } },
      {
        $addFields: {
          createdAtTH: convertToTHTime('$createdAt'),
          listProduct: {
            $filter: {
              input: '$listProduct',
              as: 'item',
              cond: { $eq: ['$$item.id', productId] }
            }
          }
        }
      },
      { $match: { listProduct: { $ne: [] } } }
    ]);


    const changeDetail = orderChangeDocs.map(o => ({
      orderId: o.orderId,
      storeId: o.store?.storeId || '',
      storeName: o.store?.name || '',
      storeAddress: o.store?.address || '',
      createAt: o.createdAt,
      total: o.total,
      status: o.status,
      statusTH: o.statusTH,
      createdAt: o.createdAt
    }));

    const changeStock = calculateQtyByUnit(productData.listUnit,
      orderChangeDocs.flatMap(o => o.listProduct)
    );



    const orderGiveDocs = await Giveaway.aggregate([
      { $match: { 'store.area': area, period, type: 'give', status: { $ne: 'canceled' } } },
      {
        $addFields: {
          createdAtTH: convertToTHTime('$createdAt'),
          listProduct: {
            $filter: {
              input: '$listProduct',
              as: 'item',
              cond: { $eq: ['$$item.id', productId] }
            }
          }
        }
      },
      { $match: { listProduct: { $ne: [] } } }
    ]);

    const giveDetail = orderGiveDocs.map(o => ({
      orderId: o.orderId,
      storeId: o.store?.storeId || '',
      storeName: o.store?.name || '',
      storeAddress: o.store?.address || '',
      createAt: o.createdAt,
      total: o.total,
      status: o.status,
      statusTH: o.statusTH,
      createdAt: o.createdAt
    }));

    const giveStock = calculateQtyByUnit(productData.listUnit,
      orderGiveDocs.flatMap(o => o.listProduct)
    );

    const summaryStockIn = calculateTotalPrice(productData.listUnit,
      [...withdrawStock, ...refundStock], 'sale');

    const summaryStockOut = calculateQtyByUnit(productData.listUnit,
      [...orderStock, ...promotionStock, ...changeStock, ...giveStock]);

    const summaryStockOutPrice = calculateTotalPrice(productData.listUnit, summaryStockOut, 'sale');
    const summaryStockBalancePrice = calculateTotalPrice(productData.listUnit, BALANCE.stock, 'sale');

    res.status(200).json({
      status: 200,
      message: 'successfully!',
      data: {
        productId: productData.id,
        productName: productData.name,
        STOCK,
        IN: {
          stock: STOCK,
          withdrawStock,
          withdraw,
          refundStock,
          refund: newRefund,
          summaryStock: calculateQtyByUnit(productData.listUnit, [
            ...refundStock,
            ...withdrawStock,
            ...STOCK.stock
          ]),
          summaryStockIn
        },
        OUT: {
          order: orderDetail,
          orderStock,
          orderSum: calculateTotalPrice(productData.listUnit, orderStock, 'sale'),
          promotionStock,
          promotionSum: calculateTotalPrice(productData.listUnit, promotionStock, 'sale'),
          changeDetail: changeDetail,
          change: changeStock,
          changeSum: calculateTotalPrice(productData.listUnit, changeStock, 'sale'),
          giveDetail: giveDetail,
          give: giveStock,
          giveSum: calculateTotalPrice(productData.listUnit, giveStock, 'sale'),
          summaryStock: summaryStockOut,
          summaryStockInOut: summaryStockOutPrice
        },
        BALANCE: BALANCE.stock,
        summary: summaryStockBalancePrice
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error', error });
  }
};

exports.checkout = async (req, res) => {
  try {
    const { type, area, period, note, withdrawId } = req.body
    const channel = req.headers['x-channel']
    const { Cart } = getModelsByChannel(channel, res, cartModel)
    const { User } = getModelsByChannel(channel, res, userModel)
    const { Product } = getModelsByChannel(channel, res, productModel)

    const { Stock, StockMovementLog, StockMovement, AdjustStock } =
      getModelsByChannel(channel, res, stockModel)

    const { startDate, endDate } = rangeDate(period)

    if (type != 'adjuststock') {
      return res.status(400).json({ status: 400, message: 'Type is not vaild' })
    }

    if (!type || !area) {
      return res
        .status(400)
        .json({ status: 400, message: 'Missing required fields!' })
    }

    const cart = await Cart.findOne({
      type,
      area,
      withdrawId,
      createdAt: { $gte: startDate, $lt: endDate }
    })
    if (!cart || cart.listProduct.length === 0) {
      return res.status(404).json({ status: 404, message: 'Cart is empty!' })
    }

    const sale = await User.findOne({ area }).select(
      'firstName surName warehouse tel saleCode salePayer'
    )
    if (!sale) {
      return res
        .status(404)
        .json({ status: 404, message: 'Sale user not found!' })
    }

    const orderId = await generateStockId(area, sale.warehouse, channel, res)
    // console.log(cart)
    const productId = cart.listProduct.flatMap(item => item.id)
    const productDetail = await Product.find({ id: { $in: productId } })

    const newOrder = {
      type,
      orderId,
      withdrawId: withdrawId,
      area: area,
      saleCode: sale.saleCode,
      period: period,
      note,
      status: 'pending',
      statusTH: 'รอนำเข้า',
      listProduct: cart.listProduct.map(item => {
        const product = productDetail.find(i => i.id === item.id)
        const factorPcs = product.listUnit.find(
          i => i.unit === item.unit
        ).factor
        const qtyPcs = item.qty * factorPcs
        return {
          id: item.id,
          name: item.name,
          qty: item.qty,
          qtyPcs: qtyPcs,
          unit: item.unit,
          price: item.price,
          action: item.action
        }
      }),
      listImage: []
      // listProduct: summary.listProduct
    }
    await AdjustStock.create(newOrder)
    await Cart.deleteOne({
      type,
      area,
      withdrawId,
      createdAt: { $gte: startDate, $lt: endDate }
    })

    const io = getSocket()
    io.emit('stock/checkout', {
      status: 200,
      message: 'Sucessful',
      newOrder
    })

    res.status(200).json({
      status: 200,
      message: 'Sucessful',
      newOrder
      // cart
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.approveAdjustStock = async (req, res) => {
  const { orderId, status } = req.body
  const channel = req.headers['x-channel']
  let statusStr = ''
  let statusThStr = ''
  if (status === true) {
    statusStr = 'approved'
    statusThStr = 'อนุมัติ'
  } else {
    statusStr = 'rejected'
    statusThStr = 'ไม่อนุมัติ'
  }

  const { Product } = getModelsByChannel(channel, res, productModel)
  const { Stock, StockMovementLog, StockMovement, AdjustStock } =
    getModelsByChannel(channel, res, stockModel)

  const DataAdjustStock = await AdjustStock.findOne({ orderId: orderId })
  if (statusStr === 'approved') {
    for (const item of DataAdjustStock.listProduct) {
      // const factorPcsResult = await Product.aggregate([
      //   { $match: { id: item.id } },
      //   {
      //     $project: {
      //       id: 1,
      //       listUnit: {
      //         $filter: {
      //           input: '$listUnit',
      //           as: 'unitItem',
      //           cond: { $eq: ['$$unitItem.unit', item.unit] }
      //         }
      //       }
      //     }
      //   }
      // ])
      // // console.log(factorPcsResult)
      // const factorCtnResult = await Product.aggregate([
      //   { $match: { id: item.id } },
      //   {
      //     $project: {
      //       id: 1,
      //       listUnit: {
      //         $filter: {
      //           input: '$listUnit',
      //           as: 'unitItem',
      //           cond: { $eq: ['$$unitItem.unit', 'CTN'] }
      //         }
      //       }
      //     }
      //   }
      // ])
      // // console.log(item.action)
      // const factorCtn = factorCtnResult[0].listUnit[0].factor
      // const factorPcs = factorPcsResult[0].listUnit[0].factor
      // const factorPcsQty = item.qty * factorPcs
      // const factorCtnQty = Math.floor(factorPcsQty / factorCtn)

      if (item.action === 'OUT') {
        const updateResult = await updateStockMongo(
          item,
          DataAdjustStock.area,
          DataAdjustStock.period,
          'approvedAdjustStockReduce',
          channel,
          res
        )
        if (updateResult) return
      } else if (item.action === 'add') {
        const updateResult = await updateStockMongo(
          item,
          DataAdjustStock.area,
          DataAdjustStock.period,
          'approvedAdjustStockAdd',
          channel,
          res
        )
        if (updateResult) return
      }
    }
  }
  await AdjustStock.findOneAndUpdate(
    { orderId: orderId, type: 'adjuststock' },
    { $set: { statusTH: statusThStr, status: statusStr } },
    { new: true }
  )

  const io = getSocket()
  io.emit('stock/approveAdjustStock', {
    status: 200,
    message: 'successfully'
  })

  res.status(200).json({
    status: 200,
    message: 'successfully'
  })
}

exports.stockToExcel = async (req, res) => {
  const { area, period, excel } = req.body
  const channel = req.headers['x-channel']
  const { Stock } = getModelsByChannel(channel, res, stockModel)
  const { Distribution } = getModelsByChannel(channel, res, distributionModel)
  const { Order } = getModelsByChannel(channel, res, orderModel)
  const { Product } = getModelsByChannel(channel, res, productModel)
  const { Refund } = getModelsByChannel(channel, res, refundModel)
  const { Giveaway } = getModelsByChannel(channel, res, giveModel)
  const periodStr = period
  const year = Number(periodStr.substring(0, 4))
  const month = Number(periodStr.substring(4, 6))

  const startOfMonthTH = new Date(year, month - 1, 1, 0, 0, 0, 0)
  const endOfMonthTH = new Date(year, month, 0, 23, 59, 59, 999)
  const thOffset = 7 * 60 * 60 * 1000
  const startOfMonthUTC = new Date(startOfMonthTH.getTime() - thOffset)
  const endOfMonthUTC = new Date(endOfMonthTH.getTime() - thOffset)

  // function to2 (num) {
  //   return Math.round((Number(num) || 0) * 100) / 100
  // }

  const [
    dataRefund,
    dataOrderSale,
    dataOrderChange,
    dataWithdraw,
    dataStock,
    dataGive
  ] = await Promise.all([
    Refund.find({
      'store.area': area,
      period: periodStr,
      createdAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
      type: 'refund'
    }),
    Order.find({
      'store.area': area,
      period: periodStr,
      createdAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
      type: 'sale'
    }),
    Order.find({
      'store.area': area,
      period: periodStr,
      createdAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
      type: 'change'
    }),
    Distribution.find({
      area: area,
      period: periodStr,
      createdAt: { $gte: startOfMonthUTC, $lte: endOfMonthUTC },
      type: 'withdraw'
    }),
    Stock.find({
      area: area,
      period: periodStr
    }).select('listProduct'),
    Giveaway.find({
      'store.area': area,
      period: periodStr
    }).select('listProduct')
  ])

  const markSource = (arr, source) =>
    arr.map(item => ({ ...item, _source: source }))

  const dataOrderPromotion = dataOrderSale.flatMap(item =>
    (item.listPromotions || []).map(u => ({
      _id: u._id,
      listProduct: u.listProduct || []
    }))
  )

  // รวม productId ที่ใช้จริง
  const productId = [
    ...dataOrderSale.flatMap(item => (item.listProduct || []).map(i => i.id)),
    ...dataRefund.flatMap(item => (item.listProduct || []).map(i => i.id)),
    ...dataOrderChange.flatMap(item => (item.listProduct || []).map(i => i.id)),
    ...dataWithdraw.flatMap(item => (item.listProduct || []).map(i => i.id)),
    ...dataGive.flatMap(item => (item.listProduct || []).map(i => i.id)),
    ...dataOrderPromotion.flatMap(item =>
      (item.listProduct || []).map(i => i.id)
    )
  ]
  const uniqueProductId = [...new Set(productId)]

  // โหลดรายละเอียดสินค้า
  const productDetail = await Product.find()

  // รวม stock ทั้งหมด
  const allListProduct = dataStock.flatMap(stock => stock.listProduct || [])
  const StockQty = allListProduct.filter(item =>
    uniqueProductId.includes(item.productId)
  )

  let sumStockIn = 0
  let sumStockInWithdraw = 0
  let sumStockInGood = 0
  let sumStockInDamaged = 0
  let sumStockInCredit = 0
  let sumStockInsumStock = 0
  let sumStockInsummary = 0

  const stockIn = [...dataRefund, ...dataWithdraw].flatMap(item =>
    (item.listProduct || []).map(i => {
      const product = productDetail.find(u => u.id === i.id)
      const factorPcs = product?.listUnit?.find(u => u.unit === i.unit)
      const qtyPcs = i.qty * (factorPcs?.factor || 1)
      const sumStock = StockQty.find(u => u.productId === i.id)
      let qtyPcsGood = 0
      let qtyPcsDamaged = 0
      let qtyWithdraw = 0
      let summary = i.total || 0
      if (i.condition === 'good') {
        qtyPcsGood = qtyPcs
      } else if (i.condition === 'damaged') {
        qtyPcsDamaged = qtyPcs
      } else {
        qtyWithdraw = qtyPcs
      }
      sumStockIn += qtyPcs
      sumStockInWithdraw += qtyWithdraw
      sumStockInGood += qtyPcsGood
      sumStockInDamaged += qtyPcsDamaged
      sumStockInCredit += 0
      sumStockInsumStock += sumStock?.stockPcs || 0
      sumStockInsummary += to2(summary)

      return {
        productId: i.id,
        name: product ? product.name : '',
        stock: qtyPcs,
        withdraw: qtyWithdraw,
        good: qtyPcsGood,
        damaged: qtyPcsDamaged,
        credit: 0,
        sumStock: sumStock?.stockPcs || 0,
        summary: to2(summary)
      }
    })
  )

  // ฟังก์ชันสำหรับเข้าถึง listProduct
  const getListProduct = item => {
    if (Array.isArray(item.listProduct)) return item.listProduct
    if (item._doc && Array.isArray(item._doc.listProduct))
      return item._doc.listProduct
    return []
  }

  const dataOrderSaleMark = markSource(dataOrderSale, 'orderSale')
  const dataOrderChangeMark = markSource(dataOrderChange, 'orderChange')
  const dataGiveMark = markSource(dataGive, 'give')
  const dataPromotionMark = markSource(dataOrderPromotion, 'promotion')

  let sumStockOutSale = 0
  let sumStockOutSummarySale = 0
  let sumStockOutPromotion = 0
  let sumStockOutSummaryPromotion = 0
  let sumStockOutChange = 0
  let sumStockOutSummaryChange = 0
  let sumStockOutGive = 0
  let sumStockOutSummaryGive = 0
  let sumStockOutexchange = 0
  let sumStockOutSummaryQtySalePromotionChange = 0
  let sumStockOutSummarySalePromotionChange = 0
  const stockOut = [
    ...dataOrderSaleMark,
    ...dataOrderChangeMark,
    ...dataGiveMark,
    ...dataPromotionMark
  ].flatMap(item =>
    getListProduct(item).map(i => {
      const product = productDetail.find(u => u.id === i.id)
      const factorPcs = product?.listUnit?.find(u => u.unit === i.unit)
      const qtyPcs = i.qty * (factorPcs?.factor || 1)

      let qtyPcsSale = 0
      let summarySale = 0
      let qtyPcsPromotion = 0
      let summaryPromotion = 0
      let qtyPcsChange = 0
      let summaryChange = 0
      let qtyPcsGive = 0
      let summaryGive = 0

      if (item._source === 'orderSale') {
        qtyPcsSale = qtyPcs
        summarySale = i.subtotal ?? 0
      } else if (item._source === 'promotion') {
        qtyPcsPromotion = qtyPcs
        summaryPromotion = i.qty * (factorPcs?.price?.sale || 0)
      } else if (item._source === 'orderChange') {
        // console.log(i)
        qtyPcsChange = qtyPcs
        summaryChange = i.netTotal ?? 0
      } else if (item._source === 'give') {
        qtyPcsGive = qtyPcs
        summaryGive = i.total ?? 0
      }

      sumStockOutSale += qtyPcsSale
      sumStockOutSummarySale += to2(summarySale)
      sumStockOutPromotion += qtyPcsPromotion
      sumStockOutSummaryPromotion += to2(summaryPromotion)
      sumStockOutChange += qtyPcsChange
      sumStockOutSummaryChange += to2(summaryChange)
      sumStockOutGive += qtyPcsGive
      sumStockOutSummaryGive += to2(summaryGive)
      sumStockOutexchange = 0
      sumStockOutSummaryQtySalePromotionChange += to2(
        (qtyPcsSale || 0) + (qtyPcsPromotion || 0) + (qtyPcsChange || 0)
      )
      sumStockOutSummarySalePromotionChange += to2(
        (summarySale || 0) + (summaryPromotion || 0) + (summaryChange || 0)
      )

      return {
        productId: i.id,
        name: product ? product.name : '',
        sale: qtyPcsSale,
        summarySale: to2(summarySale),
        promotion: qtyPcsPromotion,
        summaryPromotion: to2(summaryPromotion),
        change: qtyPcsChange,
        summaryChange: to2(summaryChange),
        give: qtyPcsGive,
        summaryGive: to2(summaryGive),
        exchange: 0,
        summaryQtySalePromotionChange: to2(
          (qtyPcsSale || 0) + (qtyPcsPromotion || 0) + (qtyPcsChange || 0)
        ),
        summarySalePromotionChange: to2(
          (summarySale || 0) + (summaryPromotion || 0) + (summaryChange || 0)
        )
      }
    })
  )

  // รวมยอดตาม productId
  const stockOutFinal = Object.values(
    stockOut.reduce((acc, cur) => {
      if (!acc[cur.productId]) {
        acc[cur.productId] = { ...cur }
      } else {
        acc[cur.productId].sale += cur.sale
        acc[cur.productId].summarySale += cur.summarySale
        acc[cur.productId].promotion += cur.promotion
        acc[cur.productId].summaryPromotion += cur.summaryPromotion
        acc[cur.productId].change += cur.change
        acc[cur.productId].summaryChange += cur.summaryChange
        acc[cur.productId].give += cur.give
        acc[cur.productId].summaryGive += cur.summaryGive
        acc[cur.productId].exchange += cur.exchange
        acc[cur.productId].summaryQtySalePromotionChange =
          (acc[cur.productId].summaryQtySalePromotionChange || 0) +
          (cur.summaryQtySalePromotionChange || 0)
        acc[cur.productId].summarySalePromotionChange =
          (acc[cur.productId].summarySalePromotionChange || 0) +
          (cur.summarySalePromotionChange || 0)
      }
      return acc
    }, {})
  )

  // balance
  let sumBalanceGood = 0
  let sumBalanceDamaged = 0
  let sumBalancesummary = 0

  const balance = allListProduct.map(item => {
    const product = productDetail.find(u => u.id === item.productId) || null
    const factorPcs = product?.listUnit?.find(
      u => u.unit === 'PCS' || u.unit === 'BOT'
    )
    sumBalanceGood += item.balancePcs || 0
    sumBalanceDamaged += 0
    sumBalancesummary += to2(
      (item.balancePcs || 0) * (factorPcs?.price?.sale || 0)
    )

    return {
      productId: item.productId,
      productName: product?.name || '',
      balanceGood: item.balancePcs || 0,
      balanceDamaged: 0,
      summary: to2((item.balancePcs || 0) * (factorPcs?.price?.sale || 0))
    }
  })

  // ส่งออก excel หรือ json
  if (excel === true) {
    const stockInWithSum = [
      ...stockIn,
      {
        productId: '',
        name: 'รวมทั้งหมด',
        stock: sumStockIn,
        withdraw: sumStockInWithdraw,
        good: sumStockInGood,
        damaged: sumStockInDamaged,
        credit: sumStockInCredit,
        sumStock: sumStockInsumStock,
        summary: sumStockInsummary
      }
    ]

    const stockInThai = stockInWithSum.map(item => ({
      รหัส: item.productId,
      ชื่อสินค้า: item.name,
      ยอดยกมา: item.stock,
      เบิกระหว่างทริป: item.withdraw,
      รับคืนดี: item.good,
      รับคืนเสีย: item.damaged,
      รับโอนจากเครดิต: item.credit,
      รวมจำนวนรับเข้า: item.sumStock,
      รวมมูลค่ารับเข้า: item.summary
    }))

    const stockOutWithSum = [
      ...stockOut,
      {
        productId: '',
        name: 'รวมทั้งหมด',
        sale: sumStockOutSale,
        summarySale: sumStockOutSummarySale,
        promotion: sumStockOutPromotion,
        summaryPromotion: sumStockOutSummaryPromotion,
        change: sumStockOutChange,
        summaryChange: sumStockOutSummaryChange,
        give: sumStockOutGive,
        summaryGive: sumStockOutSummaryGive,
        exchange: sumStockOutexchange,
        summaryQtySalePromotionChange: sumStockOutSummaryQtySalePromotionChange,
        summarySalePromotionChange: sumStockOutSummarySalePromotionChange
      }
    ]

    const stockOutThai = stockOutWithSum.map(item => ({
      รหัส: item.productId,
      ชื่อสินค้า: item.name,
      จำนวนขาย: item.sale,
      มูลค่าขาย: item.summarySale,
      จำนวนแถม: item.promotion,
      มูลค่าแถม: item.summaryPromotion,
      จำนวนที่เปลี่ยนให้ร้านค้า: item.change,
      มูลค่าเปลี่ยนให้ร้านค้า: item.summaryChange,
      จำนวนแจกสินค้า: item.give,
      มูลค่าแจกสินค้า: item.summaryGive,
      แลกซอง: item.exchange,
      'รวมจำนวนขาย+แถม+เปลี่ยน': item.summaryQtySalePromotionChange,
      'รวมมูลค่าขาย+แถม+เปลี่ยน': item.summarySalePromotionChange
    }))

    const balanceWithSum = [
      ...balance,
      {
        productId: '',
        productName: 'รวมทั้งหมด',
        balanceGood: sumBalanceGood,
        balanceDamaged: sumBalanceDamaged,
        summary: sumBalancesummary
      }
    ]

    const balanceThai = balanceWithSum.map(item => ({
      รหัส: item.productId,
      ชื่อสินค้า: item.productName,
      จำนวนคงเหลือดี: item.balanceGood,
      จำนวนคงเหลือเสีย: item.balanceDamaged,
      มูลค่าคงเหลือ: item.summary
    }))

    const wb = xlsx.utils.book_new()
    const wsStockIn = xlsx.utils.json_to_sheet(stockInThai)
    xlsx.utils.book_append_sheet(wb, wsStockIn, 'stockIn')

    const wsStockOut = xlsx.utils.json_to_sheet(stockOutThai)
    xlsx.utils.book_append_sheet(wb, wsStockOut, 'stockOut')

    const wsBalance = xlsx.utils.json_to_sheet(balanceThai)
    xlsx.utils.book_append_sheet(wb, wsBalance, 'balance')

    const tempPath = path.join(os.tmpdir(), `Stock.xlsx`)
    xlsx.writeFile(wb, tempPath)

    res.download(tempPath, 'Stock.xlsx', err => {
      if (err) {
        console.error('❌ Download error:', err)
        if (!res.headersSent) {
          res.status(500).send('Download failed')
        }
      }
      fs.unlink(tempPath, () => { })
    })
  } else {
    res.status(200).json({
      status: 200,
      message: 'successfully',
      data: {
        stockIn,
        sumStockIn,
        sumStockInGood,
        sumStockInDamaged,
        sumStockInCredit,
        sumStockInsumStock,
        sumStockInsummary,
        stockOut: stockOutFinal,
        sumStockOutSale,
        sumStockOutSummarySale,
        sumStockOutPromotion,
        sumStockOutSummaryPromotion,
        sumStockOutChange,
        sumStockOutSummaryChange,
        sumStockOutGive,
        sumStockOutSummaryGive,
        sumStockOutexchange,
        sumStockOutSummaryQtySalePromotionChange,
        sumStockOutSummarySalePromotionChange,
        balance,
        sumBalanceGood,
        sumBalanceDamaged,
        sumBalanceSummary: to2(sumBalancesummary)
      }
    })
  }
}


exports.deleteStockAdjust = async (req, res) => {
  try {
    const { orderId } = req.body
    const channel = req.headers['x-channel']
    const { AdjustStock } = getModelsByChannel(channel, res, stockModel)

    const adjust = await AdjustStock.findOne({ orderId })

    if (!adjust) {
      return res.status(404).json({
        status: 404,
        message: 'Stock adjustment not found'
      })
    }

    // อัปเดตสถานะแทนการลบจริง
    await AdjustStock.updateOne(
      { orderId },
      { status: 'delete', statusTH: 'ถูกลบ' }
    )

    return res.status(200).json({
      status: 200,
      message: 'Stock adjustment marked as deleted successfully'
    })
  } catch (error) {
    console.error('deleteStockAdjust error:', error)
    return res.status(500).json({
      status: 500,
      message: 'Internal server error'
    })
  }
}