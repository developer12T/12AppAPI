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
const { sortProduct } = require('../../utilities/product')
const path = require('path')
const errorEndpoint = require('../../middleware/errorEndpoint')
const currentFilePath = path.basename(__filename)
const { getStockAvailable } = require('./available')
const { getStockMovement } = require('../../utilities/movement')
const {
  Warehouse,
  Locate,
  Balance,
  Customer
} = require('../../models/cash/master')
const { Op, fn, col, where } = require('sequelize')
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
const approveLogModel = require('../../models/cash/approveLog')
const refundModel = require('../../models/cash/refund')
const adjustStockModel = require('../../models/cash/stock')
const { getModelsByChannel } = require('../../middleware/channel')
const os = require('os')
const { summaryOrder } = require('../../utilities/summary')
const {
  to2,
  updateStockMongo,
  calculateStockSummary
} = require('../../middleware/order')
const { getSocket } = require('../../socket')
const { group } = require('console')
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
      // {
      //   $match: {
      //     status: 'pending'
      //   }
      // },
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

    function parseSize (sizeStr) {
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
  const { area, period, condition, filter } = req.body
  const channel = req.headers['x-channel']
  const { Stock } = getModelsByChannel(channel, res, stockModel)
  const { Product } = getModelsByChannel(channel, res, productModel)
  const { Refund } = getModelsByChannel(channel, res, refundModel)
  const { AdjustStock } = getModelsByChannel(channel, res, adjustStockModel)
  const { Distribution } = getModelsByChannel(channel, res, distributionModel)
  const { Order } = getModelsByChannel(channel, res, orderModel)
  const { Giveaway } = getModelsByChannel(channel, res, giveModel)
  let listUnitPcs = []
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
  // console.log(matchQueryRefund)
  const dataRefund = await Refund.aggregate([
    {
      $match: {
        ...matchQueryRefund,
        status: { $in: ['approved', 'completed'] }
      }
    },
    {
      $project: {
        // listProduct: 1,
        _id: 0
      }
    }
  ])

  const dataWithdraw = await Distribution.aggregate([
    { $match: { status: 'confirm', ...matchQuery } },
    {
      $project: {
        _id: 0,
        listProduct: {
          $filter: {
            input: '$listProduct',
            as: 'item',
            cond: { $gt: ['$$item.receiveQty', 0] }
          }
        }
      }
    },
    // join ไปที่ products
    {
      $unwind: '$listProduct'
    },
    {
      $lookup: {
        from: 'products',
        localField: 'listProduct.id',
        foreignField: 'id',
        as: 'prod'
      }
    },
    { $unwind: '$prod' },
    // หา factor ที่ unit ตรงกัน
    {
      $set: {
        factor: {
          $let: {
            vars: {
              matched: {
                $first: {
                  $filter: {
                    input: '$prod.listUnit',
                    as: 'u',
                    cond: { $eq: ['$$u.unit', '$listProduct.unit'] }
                  }
                }
              }
            },
            in: { $ifNull: ['$$matched.factor', 1] }
          }
        }
      }
    },
    // คำนวณ qtyPcs
    {
      $set: {
        'listProduct.qtyPcs': {
          $multiply: ['$listProduct.receiveQty', '$factor']
        }
      }
    },
    // กลับมา group รวมใบละรายการ
    {
      $group: {
        _id: '$_id',
        listProduct: { $push: '$listProduct' }
      }
    },
    {
      $project: { _id: 0, listProduct: 1 }
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
    { $match: { type: 'change', status: { $in: ['approved', 'completed'] } } },
    { $match: matchQueryRefund },
    {
      $project: {
        listProduct: 1,
        _id: 0
      }
    }
  ])

  // console.log(JSON.stringify(dataChange, null, 2));

  const dataAdjust = await AdjustStock.aggregate([
    {
      $addFields: {
        zone: { $substrBytes: ['$area', 0, 2] }
      }
    },
    {
      $match: {
        type: 'adjuststock',
        status: { $in: ['approved', 'completed'] }
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

  // console.log('allAdjustProducts',allAdjustProducts)

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

  // console.log(JSON.stringify(dataRefund, null, 2))

  const withdrawProductArray = Object.values(
    allWithdrawProducts.reduce((acc, curr) => {
      // สร้าง key สำหรับ group
      const key = `${curr.id}_${curr.unit}`

      // ลบ qty เดิมออกก่อน
      const { qty, ...rest } = curr

      if (acc[key]) {
        // ถ้ามีอยู่แล้ว ให้เพิ่มจากค่าใหม่
        acc[key].qty += curr.receiveQty || 0
        acc[key].qtyPcs += curr.qtyPcs || 0
      } else {
        // ถ้ายังไม่มี ให้สร้างใหม่ พร้อม qty จาก receiveQty
        acc[key] = {
          ...rest,
          qty: curr.receiveQty || 0,
          qtyPcs: curr.qtyPcs || 0
        }
      }
      return acc
    }, {})
  )

  // withdrawProductArray.forEach(item => {
  //   if (item.id === '10071700097') {
  //     console.log(item);
  //   }
  // });

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
      const key = `${prod.id}_${prod.unit}`
      if (acc[key]) {
        acc[key].qty += prod.qty || 0
        acc[key].qtyPcs += prod.qtyPcs || 0
      } else {
        acc[key] = {
          ...prod,
          qty: prod.qty || 0,
          qtyPcs: prod.qtyPcs || 0
        }
      }
    })
    return acc
  }, {})

  // แปลงเป็น array ถ้าต้องการใช้งานต่อ
  const orderPromotionArray = Object.values(mergedProductPromotions)
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
  }).select('id name listUnit group groupCode size')

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

  // console.log(changeProductArray)

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

      // console.log(productDetailWithdraw.find(i => i.id === '10011101002'))
      const saleQty = productDetailOrder.find(i => i.unit === u.unit)?.qty ?? 0
      const promoQty =
        productDetailPromotion.find(i => i.unit === u.unit)?.qty ?? 0
      // console.log("promoQty",promoQty)
      const changeQty =
        productDetailChange.find(i => i.unit === u.unit)?.qty ?? 0
      const adjustQty =
        productDetailAdjust.find(i => i.unit === u.unit)?.qty ?? 0
      const giveQty = productDetailGive.find(i => i.unit === u.unit)?.qty ?? 0
      // console.log(damagedQty)

      const goodSale = u.price.refund
      const damagedSale = u.price.refundDmg
      const changeSale = u.price.change
      const sale = u.price.sale
      const factor = u.factor
      const stockQty = Math.floor(stock / factor) || 0
      const balanceQty = Math.floor(balance / factor) || 0

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
      summaryChange += (changeQty || 0) * sale
      summaryAdjust += (adjustQty || 0) * sale
      summaryGive += (giveQty || 0) * sale
      // console.log(withdrawQty)
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
    // .filter(unitData => {
    //   if (!condition || condition === '') return true
    //   if (condition === 'good') return unitData.good !== 0
    //   if (condition === 'damaged') return unitData.damaged !== 0
    //   if (condition === 'goodandDamaged')
    //     return unitData.good !== 0 || unitData.damaged !== 0
    //   return true
    // })

    // console.log(listUnitPcs)
    const summaryQty = calculateStockSummary(productDetail, listUnitStock)

    if (listUnitStock.length > 0) {
      const finalProductStock = {
        productId: stockItem.id,
        productName: productDetail.name,
        productGroup: productDetail.group,
        productGroupCode: productDetail.groupCode,
        size: productDetail.size,
        pcsMain: pcsMain,
        listUnit: listUnitStock,
        summaryQty: summaryQty
      }
      data.push(finalProductStock)
    }
  }

  let StockTotalCtn = 0
  let stockTotalPcs = 0
  let withdrawTotalCtn = 0
  let withdrawTotalPcs = 0
  let goodTotalCtn = 0
  let goodTotalPcs = 0
  let damagedTotalCtn = 0
  let damagedTotalPcs = 0
  let saleTotalCtn = 0
  let saleTotalPcs = 0
  let promotionTotalCtn = 0
  let promotionTotalPcs = 0
  let changeTotalCtn = 0
  let changeTotalPcs = 0
  let adjustTotalCtn = 0
  let adjustTotalPcs = 0
  let giveTotalCtn = 0
  let giveTotalPcs = 0
  let balTotalCtn = 0
  let balTotalPcs = 0

  // console.log(data[0].summaryQty[0])

  const ctn = data.map(item => {
    const factorCtn =
      dataProduct
        .find(i => i.id === item.productId)
        .listUnit.find(i => i.unit === 'CTN')?.factor ?? 0
    const pcs = item.summaryQty[0]

    const stockCtn = Math.floor((pcs.stock || 0) / (factorCtn || 1))
    const withdrawCtn = Math.floor((pcs.withdraw || 0) / (factorCtn || 1))
    const goodCtn = Math.floor((pcs.good || 0) / (factorCtn || 1))
    const damagedCtn = Math.floor((pcs.damaged || 0) / (factorCtn || 1))
    const saleCtn = Math.floor((pcs.sale || 0) / (factorCtn || 1))
    const promotionCtn = Math.floor((pcs.promotion || 0) / (factorCtn || 1))
    const changeCtn = Math.floor((pcs.change || 0) / (factorCtn || 1))
    const adjustCtn = Math.floor((pcs.adjust || 0) / (factorCtn || 1))
    const giveCtn = Math.floor((pcs.give || 0) / (factorCtn || 1))
    const balCtn = Math.floor((pcs.balance || 0) / (factorCtn || 1))

    // console.log(pcs.damaged)

    StockTotalCtn += stockCtn
    stockTotalPcs += pcs.stock
    withdrawTotalCtn += withdrawCtn
    withdrawTotalPcs += pcs.withdraw
    goodTotalCtn += goodCtn
    goodTotalPcs += pcs.good
    damagedTotalCtn += damagedCtn
    damagedTotalPcs += pcs.damaged
    saleTotalCtn += saleCtn
    saleTotalPcs += pcs.sale
    promotionTotalCtn += promotionCtn
    promotionTotalPcs += pcs.promotion
    changeTotalCtn += changeCtn
    changeTotalPcs += pcs.change
    adjustTotalCtn += adjustCtn
    adjustTotalPcs += pcs.adjust
    giveTotalCtn += giveCtn
    giveTotalPcs += pcs.give
    balTotalCtn += balCtn
    balTotalPcs += pcs.balance
  })
  // console.log(pcs)

  for (const i of data) {
    // console.log(i.productId)
    const productMeta = dataProduct.find(
      u => String(u.id) === String(i.productId)
    )
    const units = (
      productMeta?.listUnit || [{ unit: 'PCS', name: 'ชิ้น', factor: 1 }]
    ).sort((a, b) => (b.factor || 1) - (a.factor || 1)) // หน่วยใหญ่ก่อน

    const productPcs =
      (i.summaryQty || []).find(x => String(x.unit).toUpperCase() === 'PCS') ||
      {}

    // --------- เปลี่ยนแค่บล็อคนี้ แทนของเดิมที่ .map(productPcs) ----------
    const FIELDS = [
      'stock',
      'withdraw',
      'good',
      'damaged',
      'sale',
      'promotion',
      'change',
      'adjust',
      'give',
      'balance'
    ]
    const rem = Object.fromEntries(
      FIELDS.map(f => [f, Number(productPcs[f]) || 0])
    )

    const listUnit = units.map(u => {
      const factor = Number(u.factor) || 1
      const row = { unit: u.unit, unitName: u.name || u.unit, factor }
      FIELDS.forEach(f => {
        row[f] = Math.floor(rem[f] / factor)
        rem[f] %= factor
      })
      return row
    })
    // ------------------------------------------------------------------------

    const pcsData = {
      productId: i.productId,
      productName: i.productName,
      productGroup: i.productGroup,
      size: i.size,
      listUnit
    }

    listUnitPcs.push(pcsData) // <— อย่าลืม push
    // console.log(pcsData)
  }

  // const io = getSocket()
  // io.emit('stock/getStockQtyNew', {});
  let dataFinal = data.map(item => {
    const productDetail = dataProduct.find(o => o.id === item.productId)
    const minFactorObj = productDetail.listUnit.reduce((min, o) => {
      return o.factor < min.factor ? o : min
    })

    const { summaryQty, ...rest } = item // destructure แล้วแยกออก

    return {
      ...rest,
      summaryPcsPerProduct: summaryQty.find(i => i.unit === minFactorObj.unit)
    }
  })

  dataFinal = sortProduct(dataFinal, 'productGroupCode')

  res.status(200).json({
    status: 200,
    message: 'suceesful',
    // data: listUnitPcs,
    data: dataFinal,
    // data:data,
    summaryStock: Number(summaryStock.toFixed(2)),
    // StockTotalCtn,
    stockTotalPcs,

    summaryWithdraw: Number(summaryWithdraw.toFixed(2)),
    // withdrawTotalCtn,
    withdrawTotalPcs,
    summaryGood: Number(summaryGood.toFixed(2)),
    // goodTotalCtn,
    goodTotalPcs,
    summaryDamaged: Number(summaryDamaged.toFixed(2)),
    // damagedTotalCtn,
    damagedTotalPcs,
    summarySale: Number(summarySale.toFixed(2)),
    // saleTotalCtn,
    saleTotalPcs,
    summaryPromotion: Number(summaryPromotion.toFixed(2)),
    // promotionTotalCtn,
    promotionTotalPcs,
    summaryChange: Number(summaryChange.toFixed(2)),
    // changeTotalCtn,
    changeTotalPcs,
    summaryAdjust: Number(summaryAdjust.toFixed(2)),
    // adjustTotalCtn,
    adjustTotalPcs,
    summaryGive: Number(summaryGive.toFixed(2)),
    // giveTotalCtn,
    giveTotalPcs,
    summaryStockBal: Number(summaryStockBal.toFixed(2)),
    // balTotalCtn,
    balTotalPcs
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
})

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
    const { area, productId: rawProductId, period } = req.body
    const productId = String(rawProductId)
    const channel = req.headers['x-channel']

    const {
      Stock,
      Product,
      Distribution,
      Refund,
      Order,
      Giveaway,
      AdjustStock
    } = {
      Stock: getModelsByChannel(channel, res, stockModel).Stock,
      Product: getModelsByChannel(channel, res, productModel).Product,
      Distribution: getModelsByChannel(channel, res, distributionModel)
        .Distribution,
      Refund: getModelsByChannel(channel, res, refundModel).Refund,
      Order: getModelsByChannel(channel, res, orderModel).Order,
      Giveaway: getModelsByChannel(channel, res, giveModel).Giveaway,
      AdjustStock: getModelsByChannel(channel, res, adjustStockModel)
        .AdjustStock
    }

    function rollupUnits (summaryByUnit, listUnit) {
      // ต้องมี factor = จำนวนชิ้นเล็กสุดต่อ 1 หน่วยนั้น
      // เช่น CTN=80, BAG=10, PCS=1
      const meta = Object.fromEntries(
        listUnit.map(u => [u.unit, { name: u.name, factor: u.factor }])
      )

      // รวมเป็นหน่วยฐาน
      const totalBase = summaryByUnit.reduce(
        (s, x) => s + (x.qty || 0) * (meta[x.unit]?.factor ?? 1),
        0
      )

      // แจกแจงจากใหญ่ไปเล็ก
      const unitsDesc = [...listUnit].sort((a, b) => b.factor - a.factor)
      let remain = totalBase
      const out = []

      for (const u of unitsDesc) {
        const q = Math.floor(remain / u.factor)
        if (q > 0) out.push({ unit: u.unit, unitName: u.name, qty: q })
        remain -= q * u.factor
      }

      // ถ้ายังเหลือเศษ (เพราะหน่วยเล็กสุด factor > 1) ให้ใส่เป็นหน่วยเล็กสุด
      if (remain > 0) {
        const smallest = unitsDesc[unitsDesc.length - 1]
        out.push({ unit: smallest.unit, unitName: smallest.name, qty: remain })
      }
      return out
    }

    const filterProduct = (list = []) => list.filter(p => p.id === productId)

    const productData = await Product.findOne({ id: productId }).select(
      'id name listUnit'
    )

    const stockDocs = await Stock.aggregate([
      { $match: { area, period } },
      { $unwind: '$listProduct' },
      { $match: { 'listProduct.productId': productId } },
      { $addFields: { createdAtTH: convertToTHTime('$createdAt') } }
    ])

    const stockInfo = stockDocs[0] || {}
    const STOCK = buildStock(
      productData.listUnit,
      stockInfo.listProduct?.stockPcs || 0,
      stockInfo.createdAtTH
    )
    const STOCKIN = buildStock(
      productData.listUnit,
      stockInfo.listProduct?.stockInPcs || 0
    )
    const BALANCE = buildStock(
      productData.listUnit,
      stockInfo.listProduct?.balancePcs || 0
    )

    const distributionDocs = await Distribution.aggregate([
      { $match: { area, period } },
      { $match: { status: 'confirm' } },
      { $unwind: '$listProduct' },
      { $match: { 'listProduct.id': productId } },
      { $addFields: { createdAtTH: convertToTHTime('$createdAt') } }
    ])

    const withdraw = distributionDocs.map(d => ({
      area: d.area,
      orderId: d.orderId,
      orderType: d.orderType,
      orderTypeName: d.orderTypeName,
      sendDate: d.sendDate,
      total: d.listProduct.receiveQty,
      status: d.status,
      statusTH: d.statusTH,
      newTrip: d.newTrip,
      withdrawType: d.withdrawType
    }))

    const withdrawStock = productData.listUnit.map(unit => ({
      unit: unit.unit,
      unitName: unit.name,
      qty:
        unit.unit === 'CTN' ? withdraw.reduce((sum, i) => sum + i.total, 0) : 0
    }))

    const adjustStockDocs = await AdjustStock.aggregate([
      { $match: { area, period } },
      { $match: { status: { $in: ['approved', 'completed'] } } },
      { $unwind: '$listProduct' },
      { $match: { 'listProduct.id': productId } },
      { $addFields: { createdAtTH: convertToTHTime('$createdAt') } }
    ])

    const adjust = adjustStockDocs.map(d => ({
      area: d.area,
      orderId: d.orderId,
      orderType: d.type,
      orderTypeName: 'ปรับสต็อคลง',
      sendDate: d.createdAtTH,
      total: d.listProduct.qty,
      status: d.status
    }))

    const adjustStock = calculateQtyByUnit(
      productData.listUnit,
      adjustStockDocs.flatMap(r => r.listProduct)
    )

    // console.log(adjustStock)

    const refundDocs = await Refund.aggregate([
      {
        $match: {
          'store.area': area,
          period,
          status: { $in: ['approved', 'completed'] }
        }
      },
      {
        $addFields: {
          createdAtTH: convertToTHTime('$createdAt'),
          listProduct: {
            $filter: {
              input: '$listProduct',
              as: 'item',
              cond: {
                $and: [
                  { $eq: ['$$item.id', productId] },
                  { $eq: ['$$item.condition', 'good'] }
                ]
              }
            }
          }
        }
      },
      { $match: { listProduct: { $ne: [] } } }
    ])

    const newRefund = await Promise.all(
      refundDocs.map(async refund => {
        const change = await Order.findOne({
          reference: refund.orderId,
          type: 'change',
          status: { $in: ['approved', 'completed'] }
        })
          .select('total')
          .lean()
        return {
          orderId: refund.orderId,
          storeId: refund.store?.storeId || '',
          storeName: refund.store?.name || '',
          storeAddress: refund.store?.address || '',
          totalChange: (change?.total || 0).toFixed(2),
          totalRefund: (refund.total || 0).toFixed(2),
          total: ((change?.total || 0) - (refund.total || 0)).toFixed(2),
          status: refund.status,
          statusTH: refund.statusTH
        }
      })
    )

    const refundStock = calculateQtyByUnit(
      productData.listUnit,
      refundDocs.flatMap(r => r.listProduct)
    )

    // console.log(refundStock)
    const rawOrders = await Order.find({
      'store.area': area,
      period,
      type: 'sale',
      status: { $ne: 'canceled' }
    }).lean()

    const orderSaleDocs = rawOrders
      .map(order => {
        const filteredProduct = filterProduct(order.listProduct)

        const listPromotions = (order.listPromotions || []).map(promo => ({
          ...promo,
          listProduct: filterProduct(promo.listProduct)
        }))

        return {
          ...order,
          listProduct: filteredProduct,
          listPromotions,
          createdAtTH: convertToTHTime(order.createdAt)
        }
      })
      .filter(
        order =>
          order.listProduct.length > 0 ||
          order.listPromotions.some(promo => promo.listProduct.length > 0)
      )

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
    }))

    const orderStock = calculateQtyByUnit(
      productData.listUnit,
      orderSaleDocs.flatMap(o => o.listProduct)
    )

    const promotionStock = calculateQtyByUnit(
      productData.listUnit,
      orderSaleDocs.flatMap(o => o.listPromotions.flatMap(p => p.listProduct))
    )

    const orderChangeDocs = await Order.aggregate([
      {
        $match: {
          'store.area': area,
          period,
          type: 'change',
          status: { $in: ['approved', 'completed'] }
        }
      },
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
    ])

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
    }))

    const changeStock = calculateQtyByUnit(
      productData.listUnit,
      orderChangeDocs.flatMap(o => o.listProduct)
    )

    const orderGiveDocs = await Giveaway.aggregate([
      {
        $match: {
          'store.area': area,
          period,
          type: 'give',
          status: { $ne: 'canceled' }
        }
      },
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
    ])

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
    }))

    const giveStock = calculateQtyByUnit(
      productData.listUnit,
      orderGiveDocs.flatMap(o => o.listProduct)
    )

    const summaryStockIn = calculateTotalPrice(
      productData.listUnit,
      [...withdrawStock, ...refundStock],
      'sale'
    )

    const summaryStockOut = calculateQtyByUnit(productData.listUnit, [
      ...orderStock,
      ...promotionStock,
      ...changeStock,
      ...giveStock,
      ...adjustStock
    ])

    const normalizedStockOut = rollupUnits(
      summaryStockOut,
      productData.listUnit
    )

    // console.log(productData.listUnit)

    const summaryStockInQty = calculateQtyByUnit(productData.listUnit, [
      ...refundStock,
      ...withdrawStock,
      ...STOCK.stock
    ])

    const normalizedStockIn = rollupUnits(
      summaryStockInQty,
      productData.listUnit
    )

    // console.log(normalizedStockIn)

    const summaryStockOutQty = calculateQtyByUnit(productData.listUnit, [
      ...orderStock,
      ...promotionStock,
      ...changeStock,
      ...giveStock,
      ...adjustStock
    ])

    const summaryStockOutPrice = calculateTotalPrice(
      productData.listUnit,
      summaryStockOut,
      'sale'
    )
    const summaryStockBalancePrice = calculateTotalPrice(
      productData.listUnit,
      BALANCE.stock,
      'sale'
    )

    // console.log(summaryStockIn)

    totalStockInPcs = 0
    const stockInPcs = summaryStockInQty.map(item => {
      const pcs = productData.listUnit.find(i => i.Unit === item.Unit).factor
      totalStockInPcs += pcs * item.qty
      // console.log(pcs)
    })
    totalStockOutPcs = 0
    summaryStockOutQty.forEach(item => {
      const unitObj = productData.listUnit.find(i => i.Unit === item.unit)
      const pcs = unitObj ? unitObj.factor : 0
      totalStockOutPcs += pcs * item.qty
    })

    // console.log(totalStockInPcs)
    // console.log(totalStockOutPcs)

    res.status(200).json({
      status: 200,
      message: 'successfully!',
      data: {
        productId: productData.id,
        productName: productData.name,
        // group: productData.group,
        STOCK,
        IN: {
          stock: STOCK,
          withdrawStock,
          withdraw,
          refundStock,
          refund: newRefund,
          summaryStock: normalizedStockIn,
          summaryStockIn
        },
        OUT: {
          order: orderDetail,
          orderStock,
          orderSum: calculateTotalPrice(
            productData.listUnit,
            orderStock,
            'sale'
          ),
          adjustStock,
          adjustDetail: adjust,
          promotionStock,
          promotionSum: calculateTotalPrice(
            productData.listUnit,
            promotionStock,
            'sale'
          ),
          changeDetail: changeDetail,
          change: changeStock,
          changeSum: calculateTotalPrice(
            productData.listUnit,
            changeStock,
            'sale'
          ),
          giveDetail: giveDetail,
          give: giveStock,
          giveSum: calculateTotalPrice(productData.listUnit, giveStock, 'sale'),
          summaryStock: normalizedStockOut,
          summaryStockInOut: summaryStockOutPrice
        },
        totalStockInPcs: totalStockInPcs,
        totalStockOutPcs: totalStockOutPcs,
        BALANCE: BALANCE.stock,
        // summaryQtyPcs:,
        summary: summaryStockBalancePrice
      }
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Internal Server Error', error })
  }
}

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
  const { orderId, status, user } = req.body
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
  const { ApproveLogs } = getModelsByChannel(channel, res, approveLogModel)
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

  await ApproveLogs.create({
    module: 'approveAdjustStock',
    user: user,
    status: statusStr,
    id: orderId
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

    const tempPath = path.join(os.tmpdir(), `Stock_${area}.xlsx`)
    xlsx.writeFile(wb, tempPath)

    res.download(tempPath, `Stock_${area}.xlsx`, err => {
      if (err) {
        console.error('❌ Download error:', err)
        if (!res.headersSent) {
          res.status(500).send('Download failed')
        }
      }
      fs.unlink(tempPath, () => {})
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

exports.stockToExcelNew = async (req, res) => {
  try {
    const { area, period, excel } = req.body
    const channel = req.headers['x-channel']

    if (!area || !period) {
      return res
        .status(400)
        .json({ status: 400, message: 'area, period are required' })
    }

    // ฟังก์ชันแปลงจำนวน pcs → รายหน่วย
    const convertToUnits = (totalPcs, units) => {
      let remaining = totalPcs
      return units.map(u => {
        const qty = Math.floor(remaining / u.factor)

        const price = u.price.sale
        remaining = remaining % u.factor
        return {
          unit: u.unit,
          unitName: u.name,
          qty,
          price: qty * price
        }
      })
    }

    // ---------- Models ----------
    const { Stock } = getModelsByChannel(channel, res, stockModel)
    const { Distribution } = getModelsByChannel(channel, res, distributionModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { Giveaway } = getModelsByChannel(channel, res, giveModel)

    // ---------- Fetch base data (รอบเดียว) ----------
    const [
      dataRefund,
      dataOrderSale,
      dataOrderChange,
      dataWithdraw,
      dataStockListOnly,
      dataGive,
      warehouseDoc
    ] = await Promise.all([
      Refund.find({
        'store.area': area,
        period,
        status: { $in: ['completed', 'approved'] },
        type: 'refund'
      }).lean(),
      Order.find({
        'store.area': area,
        period,
        type: 'sale',
        status: { $in: ['pending', 'completed'] }
      }).lean(),
      Order.find({
        'store.area': area,
        period,
        type: 'change',
        status: { $in: ['approved', 'completed'] }
      }).lean(),
      Distribution.find({
        area,
        period,
        status: { $in: ['confirm'] },
        type: 'withdraw'
      }).lean(),
      Stock.find({ area, period }).select('listProduct').lean(),
      Giveaway.find({
        'store.area': area,
        period,
        status: { $in: ['pending', 'approved', 'completed'] },
        type: 'give'
      }).lean(),
      Stock.findOne({ area, period }).select('warehouse').lean()
    ])

    const warehouseCode = String(warehouseDoc?.warehouse || '').trim()

    // ---------- Promotions ใน order sale ----------
    const dataOrderPromotion = dataOrderSale.flatMap(item =>
      (item.listPromotions || []).map(u => ({
        _id: u?._id,
        listProduct: u?.listProduct || []
      }))
    )

    // ---------- Unique product ids (ทุกแหล่งที่เกี่ยว) ----------
    const productIdUsed = [
      ...dataOrderSale.flatMap(x => (x.listProduct || []).map(i => i.id)),
      ...dataRefund.flatMap(x => (x.listProduct || []).map(i => i.id)),
      ...dataOrderChange.flatMap(x => (x.listProduct || []).map(i => i.id)),
      ...dataWithdraw.flatMap(x => (x.listProduct || []).map(i => i.id)),
      ...dataGive.flatMap(x => (x.listProduct || []).map(i => i.id)),
      ...dataOrderPromotion.flatMap(x => (x.listProduct || []).map(i => i.id)),
      ...dataStockListOnly.flatMap(s =>
        (s.listProduct || []).map(i => i.productId)
      )
    ]
      .filter(Boolean)
      .map(s => String(s).trim())

    const uniqueProductId = [...new Set(productIdUsed)]

    // ---------- Product detail (เฉพาะที่จำเป็น) ----------
    const productDetail = await Product.find(
      { id: { $in: uniqueProductId } },
      { id: 1, name: 1, listUnit: 1 }
    ).lean()

    // Fast lookup
    const prodById = new Map(
      (productDetail || []).map(p => [String(p.id).trim(), p])
    )

    const getFactor = (productId, unit) => {
      const pid = String(productId ?? '').trim()
      const u = String(unit ?? '').trim()
      const prod = prodById.get(pid)
      const unitInfo = prod?.listUnit?.find(
        x => String(x.unit ?? '').trim() === u
      )
      return Number(unitInfo?.factor) || 1
    }

    const getSalePrice = productId => {
      const prod = prodById.get(String(productId).trim())
      const u = prod?.listUnit?.find(x => {
        const U = String(x?.unit || '').toUpperCase()
        return U === 'PCS' || U === 'BOT'
      })
      return Number(u?.price?.sale) || 0
    }

    const getPromoValue = (productId, unit, qty) => {
      const pid = String(productId ?? '').trim()
      const u = String(unit ?? '').trim()
      const prod = prodById.get(pid)
      const unitInfo = prod?.listUnit?.find(
        x => String(x.unit ?? '').trim() === u
      )
      const price = Number(unitInfo?.price?.sale) || 0
      return (Number(qty) || 0) * price
    }

    // ---------- Stock OUT ----------
    const buildRowsFromListProduct = (source, sourceName) => {
      const rows = []
      for (const item of source) {
        const customerCode = item?.store?.storeId ?? ''
        const customerName = item?.store?.name ?? ''
        const inv = item?.orderId ?? item?.invNo ?? item?.refNo ?? ''

        if (!Array.isArray(item?.listProduct)) continue

        for (const p of item.listProduct) {
          const qtyPCS = (Number(p?.qty) || 0) * getFactor(p?.id, p?.unit)

          const row = {
            customerCode,
            customerName,
            inv,
            productId: p?.id,
            productName: p?.name,
            qtySale: 0,
            valSale: 0,
            qtyPromo: 0,
            valPromo: 0,
            qtyChange: 0,
            valChange: 0,
            qtyGive: 0,
            valGive: 0
          }

          if (sourceName === 'Sale') {
            row.qtySale = qtyPCS
            row.valSale = Number(p?.subtotal ?? 0)
          } else if (sourceName === 'Change') {
            row.qtyChange = qtyPCS
            row.valChange = Number(p?.netTotal ?? 0)
          } else if (sourceName === 'Give') {
            row.qtyGive = qtyPCS
            row.valGive = Number(p?.total ?? 0)
          }

          rows.push(row)
        }
      }
      return rows
    }

    const buildRowsPromotionFromSale = saleOrders => {
      const rows = []
      for (const item of saleOrders) {
        const customerCode = item?.store?.storeId ?? ''
        const customerName = item?.store?.name ?? ''
        const inv = item?.orderId ?? item?.invNo ?? item?.refNo ?? ''
        if (!Array.isArray(item?.listPromotions)) continue

        for (const promo of item.listPromotions) {
          if (!Array.isArray(promo?.listProduct)) continue
          for (const p of promo.listProduct) {
            const qtyPCS = (Number(p?.qty) || 0) * getFactor(p?.id, p?.unit)
            rows.push({
              customerCode,
              customerName,
              inv,
              productId: p?.id,
              productName: p?.name,
              qtySale: 0,
              valSale: 0,
              qtyPromo: qtyPCS,
              valPromo: Number(
                p?.subtotal ?? getPromoValue(p?.id, p?.unit, p?.qty)
              ),
              qtyChange: 0,
              valChange: 0,
              qtyGive: 0,
              valGive: 0
            })
          }
        }
      }
      return rows
    }

    const stockOutDataRaw = [
      ...buildRowsFromListProduct(dataOrderSale, 'Sale'),
      ...buildRowsFromListProduct(dataOrderChange, 'Change'),
      ...buildRowsFromListProduct(dataGive, 'Give'),
      ...buildRowsPromotionFromSale(dataOrderSale)
    ]

    // รวมซ้ำ: customerCode + customerName + inv + productId
    const mergeDuplicateRows = data => {
      const map = new Map()
      for (const row of data) {
        const key = `${row.customerCode}|${row.customerName}|${row.inv}|${row.productId}`
        if (!map.has(key)) {
          map.set(key, { ...row })
        } else {
          const ex = map.get(key)
          ex.qtySale += row.qtySale
          ex.valSale += row.valSale
          ex.qtyPromo += row.qtyPromo
          ex.valPromo += row.valPromo
          ex.qtyChange += row.qtyChange
          ex.valChange += row.valChange
          ex.qtyGive += row.qtyGive
          ex.valGive += row.valGive
        }
      }
      return [...map.values()]
    }

    const stockOutData = mergeDuplicateRows(stockOutDataRaw)

    // (3) ประกอบ balance ต่อสินค้าใน stock
    const stockOutDataFinal = stockOutData.map(item => {
      const pid = String(item?.productId || '').trim()
      const productDetailItem = productDetail.find(u => u.id == pid)
      const productDetailUnit = productDetailItem?.listUnit || []

      const prod = prodById.get(pid)
      const sumOutUnit =
        (item.qtySale || 0) +
        (item.qtyPromo || 0) +
        (item.qtyChange || 0) +
        (item.qtyGive || 0)

      const outUnit = convertToUnits(sumOutUnit, productDetailUnit)
      const totalPrice = outUnit.reduce(
        (sum, u) => sum + (Number(u.price) || 0),
        0
      )

      return {
        customerCode: item.customerCode,
        customerName: item.customerName,
        inv: item.inv,
        productId: pid,
        productName: prod?.name || '',
        salePcs: item.qtySale,
        saleUnit: convertToUnits(item.qtySale, productDetailUnit),
        promoPcs: item.qtyPromo,
        promoUnit: convertToUnits(item.qtyPromo, productDetailUnit),
        changePcs: item.qtyChange,
        changeUnit: convertToUnits(item.qtyChange, productDetailUnit),
        givePcs: item.qtyGive,
        giveUnit: convertToUnits(item.qtyGive, productDetailUnit),
        sumOut: sumOutUnit,
        outUnit: outUnit,
        totalPrice: totalPrice
      }
    })

    // console.log(stockOutDataFinal)

    // รวมยอด OUT (รวมก่อน ค่อยปัดทศนิยม)
    const sumStockOutSale = stockOutData.reduce(
      (a, r) => a + (Number(r.qtySale) || 0),
      0
    )
    const sumStockOutPromotion = stockOutData.reduce(
      (a, r) => a + (Number(r.qtyPromo) || 0),
      0
    )
    const sumStockOutChange = stockOutData.reduce(
      (a, r) => a + (Number(r.qtyChange) || 0),
      0
    )
    const sumStockOutGive = stockOutData.reduce(
      (a, r) => a + (Number(r.qtyGive) || 0),
      0
    )

    const sumStockOutSummarySale = to2(
      stockOutData.reduce((a, r) => a + (Number(r.valSale) || 0), 0)
    )
    const sumStockOutSummaryPromotion = to2(
      stockOutData.reduce((a, r) => a + (Number(r.valPromo) || 0), 0)
    )
    const sumStockOutSummaryChange = to2(
      stockOutData.reduce((a, r) => a + (Number(r.valChange) || 0), 0)
    )
    const sumStockOutSummaryGive = to2(
      stockOutData.reduce((a, r) => a + (Number(r.valGive) || 0), 0)
    )

    const sumStockOutexchange = 0
    const sumStockOutSummaryQtySalePromotionChange = to2(
      sumStockOutSale + sumStockOutPromotion + sumStockOutChange
    )
    const sumStockOutSummarySalePromotionChange = to2(
      sumStockOutSummarySale +
        sumStockOutSummaryPromotion +
        sumStockOutSummaryChange
    )

    // ---------- Stock IN ----------
    const allListProduct = dataStockListOnly.flatMap(s => s.listProduct || [])
    const stockQty = allListProduct.filter(x =>
      uniqueProductId.includes(String(x.productId).trim())
    )

    let sumStockIn = 0
    let sumStockInWithdraw = 0
    let sumStockInGood = 0
    let sumStockInDamaged = 0
    let sumStockInCredit = 0
    let sumStockInsumStock = 0
    let sumStockInsummary = 0

    // console.log(dataWithdraw)
    const stockIn = [...dataRefund, ...dataWithdraw].flatMap(item =>
      (item.listProduct || []).map(i => {
        if (i.condition === 'damaged') {
          return null
        }

        const pid = String(i?.id || '').trim()
        const product = productDetail.find(p => String(p.id).trim() === pid)
        const unitPCS = product?.listUnit?.find(u =>
          ['PCS', 'BOT'].includes(String(u.unit).trim().toUpperCase())
        )
        const productDetailPricePCS = unitPCS?.price?.sale ?? 0
        // console.log(productDetailPricePCS)

        const prod = prodById.get(pid)
        const qtyPCS = (Number(i?.receiveQty) || 0) * getFactor(pid, i?.unit)

        const inStock = stockQty.find(u => String(u.productId).trim() === pid)
        let qtyPcsGood = 0,
          qtyPcsDamaged = 0,
          qtyWithdraw = 0

        if (String(i?.condition || '') === 'good') qtyPcsGood = i.qtyPcs
        // else if (String(i?.condition || '') === 'damaged') qtyPcsDamaged = i.qtyPcs;
        else qtyWithdraw = qtyPCS // สำหรับ withdraw
        // console.log(qtyPcsGood)
        const summary = (qtyWithdraw + qtyPcsGood) * productDetailPricePCS

        sumStockIn += qtyPCS
        sumStockInWithdraw += qtyWithdraw
        sumStockInGood += qtyPcsGood
        sumStockInDamaged += qtyPcsDamaged
        sumStockInCredit += 0
        sumStockInsumStock += qtyWithdraw + qtyPcsGood || 0
        sumStockInsummary += summary

        return {
          productId: pid,
          name: prod ? prod.name : '',
          withdraw: qtyWithdraw,
          good: qtyPcsGood,
          sumStock: qtyWithdraw + qtyPcsGood,
          summary: to2(summary)
        }
      })
    )
    // console.log(stockIn)

    const stockInSummed = [
      ...(stockIn ?? [])
        .reduce((m, r) => {
          const pid = String(r?.productId ?? '').trim()
          if (!pid) return m
          const o =
            m.get(pid) ??
            (m.set(pid, {
              productId: pid,
              name: r?.name || '',
              withdraw: 0,
              good: 0,
              sumStock: 0,
              summary: 0
            }),
            m.get(pid))
          o.withdraw += +r.withdraw || 0
          o.good += +r.good || 0
          o.sumStock += +r.sumStock || 0
          o.summary += +r.summary || 0
          if (!o.name && r?.name) o.name = r.name
          return m
        }, new Map())
        .values()
    ].map(x => ({ ...x, summary: to2(x.summary) }))

    let stockInPrice = 0

    // (3) ประกอบ balance ต่อสินค้าใน stock
    const stockInSummedFinal = stockInSummed.map(item => {
      const pid = String(item?.productId || '').trim()
      const productDetailItem = productDetail.find(u => u.id == pid)
      const productDetailUnit = productDetailItem?.listUnit || []

      const prod = prodById.get(pid)

      // แปลงเป็นแต่ละ unit
      const withdrawByUnit = convertToUnits(item.withdraw, productDetailUnit)
      const goodByUnit = convertToUnits(item.good, productDetailUnit)
      const sumStockByUnit = convertToUnits(item.sumStock, productDetailUnit)

      // รวมราคาเฉพาะ product นี้
      const totalPrice = sumStockByUnit.reduce(
        (sum, u) => sum + (Number(u.price) || 0),
        0
      )

      return {
        productId: pid,
        productName: prod?.name || '',
        withdraw: item.withdraw,
        withdrawByUnit,
        good: item.good,
        goodByUnit,
        sumStock: item.sumStock,
        sumStockByUnit,
        totalPrice
      }
    })

    const prodByIds = new Map(
      (productDetail ?? []).map(p => [String(p.id).trim(), p])
    )
    const stockByPid = new Map(
      (stockQty ?? []).map(s => [String(s.productId).trim(), s])
    )

    const stockInFinal = (stockInSummed ?? []).map(item => {
      const pid = String(item.productId).trim()
      const prod = prodByIds.get(pid)

      const withdrawPCS = Number(item.withdraw) || 0
      const goodPCS = Number(item.good) || 0
      const damagedPCS = Number(item.damaged) || 0 // ถ้าไม่มี ให้เป็น 0

      // ข้อมูล balance (ถ้ามี) ใช้อันไหนได้ก่อน
      const stockRow = stockByPid.get(pid)
      const balancePCS = Number(stockRow?.balancePcs ?? stockRow?.balance ?? 0)
      const balanceList = Array.isArray(stockRow?.listUnit)
        ? stockRow.listUnit
        : null

      const listUnit = (prod?.listUnit ?? []).map(u => {
        const unit = String(u.unit).trim()
        const unitName = u.name ?? u.unitName ?? ''
        const factor = Number(u.factor) || 1

        const withdraw = Math.floor(withdrawPCS / factor)
        const good = Math.floor(goodPCS / factor)
        const damaged = Math.floor(damagedPCS / factor)

        // คำนวณ balance เป็นหน่วยเดียวกัน (ถ้ารู้)
        let balance = 0
        if (balanceList) {
          const bu = balanceList.find(
            x => String(x.unit).trim().toUpperCase() === unit.toUpperCase()
          )
          balance = Number(bu?.balance ?? bu?.stock ?? 0) || 0 // ถ้าระบุไว้ต่อหน่วย ใช้ตรงๆ
        } else if (balancePCS) {
          balance = Math.floor(balancePCS / factor) // แปลงจาก PCS → หน่วย
        }

        return { unit, unitName, withdraw, good, damaged, balance }
      })

      return {
        productId: pid,
        productName: prod?.name ?? item.name ?? '',
        productGroup: prod?.group ?? prod?.productGroup ?? '',
        productGroupCode: prod?.groupCode ?? prod?.productGroupCode ?? '',
        listUnit
      }
    })

    // console.log(stockInFinal);

    sumStockInsummary = to2(sumStockInsummary)

    // ---------- Balance: ดึง M3 ทีเดียว + damaged รวมต่อสินค้า ----------
    // (1) แบนรายการ damaged จาก refund ทั้งหมด
    const refundsFlat = (
      Array.isArray(dataRefund) ? dataRefund : dataRefund ? [dataRefund] : []
    ).flatMap(u => u?.listProduct || [])

    // รวม damaged qty ต่อ product (ใช้ qtyPcs ถ้ามี ไม่งั้น convert)
    const damagedById = new Map()
    for (const r of refundsFlat) {
      if (String(r?.condition || '').toLowerCase() !== 'damaged') continue
      const pid = String(r?.id || '').trim()
      const add =
        Number(r?.qtyPcs ?? (Number(r?.qty) || 0) * getFactor(pid, r?.unit)) ||
        0
      damagedById.set(pid, (damagedById.get(pid) || 0) + add)
    }

    // (2) ดึง M3 จาก MSSQL ทีเดียวด้วย IN (trim คอลัมน์ฝั่ง DB)
    let m3ByPid = new Map()
    if (warehouseCode && uniqueProductId.length) {
      const m3Rows = await Balance.findAll({
        where: {
          coNo: 410,
          warehouse: warehouseCode,
          [Op.and]: [
            where(fn('LTRIM', fn('RTRIM', col('MBITNO'))), {
              [Op.in]: uniqueProductId
            })
          ]
        },
        attributes: ['MBITNO', 'itemAllowcatable'],
        raw: true
      })

      // รวมเป็น map โดยใช้ MBITNO trim
      m3ByPid = m3Rows.reduce((map, r) => {
        const pid = String(r?.MBITNO || '').trim()
        const val = Number(r?.itemAllowcatable) || 0
        map.set(pid, (map.get(pid) || 0) + val)
        return map
      }, new Map())
    }

    // (3) ประกอบ balance ต่อสินค้าใน stock
    const balance = allListProduct.map(item => {
      const pid = String(item?.productId || '').trim()
      const productDetailItem = productDetail.find(u => u.id == pid)
      const productDetailUnit = productDetailItem?.listUnit || []

      const prod = prodById.get(pid)
      const balanceGood = Number(item?.balancePcs) || 0
      const salePrice = getSalePrice(pid)
      const balanceM3 = Number(m3ByPid.get(pid)) || 0
      const balanceDamaged = Number(damagedById.get(pid)) || 0
      const balanceGoodByUnit = convertToUnits(balanceGood, productDetailUnit)
      const totalPrice = balanceGoodByUnit.reduce(
        (sum, u) => sum + (Number(u.price) || 0),
        0
      )
      return {
        productId: pid,
        productName: prod?.name || '',
        balanceGood,
        balanceGoodByUnit: balanceGoodByUnit,
        balanceM3,
        balanceM3ByUnit: convertToUnits(balanceM3, productDetailUnit),
        balanceDamaged,
        balanceDamagedByUnit: convertToUnits(balanceDamaged, productDetailUnit),
        // summary: to2(balanceGood * salePrice)
        totalPrice
      }
    })

    // รวมยอด balance
    const totals = balance.reduce(
      (acc, r) => {
        acc.sumBalanceGood += Number(r.balanceGood) || 0
        acc.sumBalanceM3 += Number(r.balanceM3) || 0
        acc.sumBalanceDamaged += Number(r.balanceDamaged) || 0
        acc.sumBalancesummary += Number(r.summary) || 0
        return acc
      },
      {
        sumBalanceGood: 0,
        sumBalanceM3: 0,
        sumBalanceDamaged: 0,
        sumBalancesummary: 0
      }
    )

    const sumBalanceGood = totals.sumBalanceGood
    const sumBalanceM3 = totals.sumBalanceM3
    const sumBalanceDamaged = totals.sumBalanceDamaged
    const sumBalancesummary = to2(totals.sumBalancesummary)

    const q = (arr, ...aliases) => {
      if (!arr?.length) return 0
      const wanted = new Set(aliases.map(u => String(u).toUpperCase()))
      return arr.reduce(
        (sum, x) =>
          wanted.has(String(x.unit).toUpperCase())
            ? sum + (Number(x.qty) || 0)
            : sum,
        0
      )
    }

    // ---------- Export / JSON ----------
    if (excel === true) {
      // Sheet: stockIn
      const inRows = [
        // แถว 1: ชื่อกลุ่ม (กิน 3 คอลัมน์)
        [
          'รหัส',
          'ชื่อสินค้า',
          'เบิกระหว่างทริป',
          '',
          '',
          'รับคืนดี',
          '',
          '',
          'รวมจำนวนทั้งหมด',
          '',
          '',
          'มูลค่าทั้งหมด'
          // 'มูลค่าคงเหลือ'
        ],
        // แถว 2: หน่วยย่อย
        [
          'รหัส',
          'ชื่อสินค้า',
          'หีบ',
          'แพค/ถุง',
          'ซอง/ขวด',
          'หีบ',
          'แพค/ถุง',
          'ซอง/ขวด',
          'หีบ',
          'แพค/ถุง',
          'ซอง/ขวด'
          // 'มูลค่าคงเหลือ'
        ],
        ...[
          ...stockInSummedFinal
          // , balanceSummaryRow
        ].map(it => [
          it.productId,
          it.productName,
          q(it.withdrawByUnit, 'CTN'),
          q(it.withdrawByUnit, 'BAG', 'PAC'),
          q(it.withdrawByUnit, 'PCS', 'BOT'),
          q(it.goodByUnit, 'CTN'),
          q(it.goodByUnit, 'BAG', 'PAC'),
          q(it.goodByUnit, 'PCS', 'BOT'),
          q(it.sumStockByUnit, 'CTN'),
          q(it.sumStockByUnit, 'BAG', 'PAC'),
          q(it.sumStockByUnit, 'PCS', 'BOT'),
          it.totalPrice
          // it.summaryNumeric ?? it.summary
        ])
      ]

      // สร้างชีทก่อน แล้วค่อย merge + ตั้งความกว้าง
      const wsIn = xlsx.utils.aoa_to_sheet(inRows)

      wsIn['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, // A1:A2 รหัส
        { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }, // B1:B2 ชื่อสินค้า
        { s: { r: 0, c: 2 }, e: { r: 0, c: 4 } }, // C1:E1 จำนวนคงเหลือดี
        { s: { r: 0, c: 5 }, e: { r: 0, c: 7 } }, // F1:H1 จำนวนคงจากM3
        { s: { r: 0, c: 8 }, e: { r: 0, c: 10 } }, // I1:K1 จำนวนคงเหลือเสีย
        { s: { r: 0, c: 11 }, e: { r: 1, c: 11 } } // L1:L2 มูลค่าคงเหลือ
      ]

      wsIn['!cols'] = [
        { wch: 14 },
        { wch: 40 }, // A,B
        { wch: 8 },
        { wch: 10 },
        { wch: 10 }, // C,D,E
        { wch: 8 },
        { wch: 10 },
        { wch: 10 }, // F,G,H
        { wch: 8 },
        { wch: 10 },
        { wch: 10 }, // I,J,K
        { wch: 16 } // L
      ]

      const OutRows = [
        // แถว 1: หัวตารางใหญ่
        [
          'customerCode',
          'customerName',
          'Inv',
          'รหัส',
          'ชื่อสินค้า',
          'จำนวนขาย',
          '',
          '',
          'จำนวนแถม',
          '',
          '',
          'จำนวนที่เปลี่ยน',
          '',
          '',
          'จำนวนแจกสินค้า',
          '',
          '',
          'รวมจำนวนทั้งหมด',
          '',
          '',
          'มูลค่าทั้งหมด'
          // 'มูลค่าคงเหลือ'
        ],
        // แถว 2: หน่วยย่อย (ต้องเว้น 3 ช่องแรกให้ตรง A,B,C)
        [
          '',
          '',
          '', // <-- สำหรับ customerCode, customerName, Inv (จะ merge ลงมา)
          'รหัส',
          'ชื่อสินค้า', // <-- D,E จะ merge ลงมาเช่นกัน
          'หีบ',
          'แพค/ถุง',
          'ซอง/ขวด', // F,G,H
          'หีบ',
          'แพค/ถุง',
          'ซอง/ขวด', // I,J,K
          'หีบ',
          'แพค/ถุง',
          'ซอง/ขวด', // L,M,N
          'หีบ',
          'แพค/ถุง',
          'ซอง/ขวด', // O,P,Q
          'หีบ',
          'แพค/ถุง',
          'ซอง/ขวด'
          // 'มูลค่าคงเหลือ'
        ],
        ...stockOutDataFinal.map(it => [
          it.customerCode,
          it.customerName,
          it.inv,
          it.productId,
          it.productName,
          q(it.saleUnit, 'CTN'),
          q(it.saleUnit, 'BAG', 'PAC'),
          q(it.saleUnit, 'PCS', 'BOT'),
          q(it.promoUnit, 'CTN'),
          q(it.promoUnit, 'BAG', 'PAC'),
          q(it.promoUnit, 'PCS', 'BOT'),
          q(it.changeUnit, 'CTN'),
          q(it.changeUnit, 'BAG', 'PAC'),
          q(it.changeUnit, 'PCS', 'BOT'),
          q(it.giveUnit, 'CTN'),
          q(it.giveUnit, 'BAG', 'PAC'),
          q(it.giveUnit, 'PCS', 'BOT'),
          q(it.outUnit, 'CTN'),
          q(it.outUnit, 'BAG', 'PAC'),
          q(it.outUnit, 'PCS', 'BOT'),
          it.totalPrice
          // it.summaryNumeric ?? it.summary
        ])
      ]

      // สร้างชีท
      const wsOut = xlsx.utils.aoa_to_sheet(OutRows)

      // Merge header ให้ตรงกับตำแหน่งคอลัมน์จริง:
      // A  B  C  D  E  F  G  H  I  J  K  L  M  N  O  P  Q
      // 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16
      wsOut['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, // A1:A2 customerCode
        { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }, // B1:B2 customerName
        { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } }, // C1:C2 Inv

        { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } }, // D1:D2 รหัส (สินค้า)
        { s: { r: 0, c: 4 }, e: { r: 1, c: 4 } }, // E1:E2 ชื่อสินค้า

        { s: { r: 0, c: 5 }, e: { r: 0, c: 7 } }, // F1:H1 จำนวนขาย
        { s: { r: 0, c: 8 }, e: { r: 0, c: 10 } }, // I1:K1 จำนวนแถม
        { s: { r: 0, c: 11 }, e: { r: 0, c: 13 } }, // L1:N1 จำนวนที่เปลี่ยน
        { s: { r: 0, c: 14 }, e: { r: 0, c: 16 } }, // O1:Q1 จำนวนแจกสินค้า
        { s: { r: 0, c: 17 }, e: { r: 0, c: 19 } }

        // ถ้ามี "มูลค่าคงเหลือ" เพิ่มคอลัมน์ R แล้ว merge: { s:{r:0,c:17}, e:{r:1,c:17} }
      ]

      // ตั้งความกว้างคอลัมน์ (เผื่ออ่านง่ายขึ้น)
      wsOut['!cols'] = [
        { wch: 14 }, // A customerCode
        { wch: 28 }, // B customerName
        { wch: 10 }, // C Inv
        { wch: 14 }, // D รหัสสินค้า
        { wch: 40 }, // E ชื่อสินค้า

        { wch: 8 },
        { wch: 10 },
        { wch: 10 }, // F,G,H   จำนวนขาย
        { wch: 8 },
        { wch: 10 },
        { wch: 10 }, // I,J,K   จำนวนแถม
        { wch: 8 },
        { wch: 10 },
        { wch: 10 }, // L,M,N   จำนวนที่เปลี่ยน
        { wch: 8 },
        { wch: 10 },
        { wch: 10 } // O,P,Q   จำนวนแจกสินค้า

        // { wch: 16 }, // R ถ้ามีมูลค่าคงเหลือ
      ]

      // Sheet: balance
      const balanceRows = [
        // แถว 1: ชื่อกลุ่ม (กิน 3 คอลัมน์)
        [
          'รหัส',
          'ชื่อสินค้า',
          'จำนวนคงเหลือดี',
          '',
          '',
          'จำนวนคงจากM3',
          '',
          '',
          'จำนวนคงเหลือเสีย',
          '',
          '',
          'มูลค่าคงเหลือดี'
        ],
        // แถว 2: หน่วยย่อย
        [
          'รหัส',
          'ชื่อสินค้า',
          'หีบ',
          'แพค/ถุง',
          'ซอง/ขวด',
          'หีบ',
          'แพค/ถุง',
          'ซอง/ขวด',
          'หีบ',
          'แพค/ถุง',
          'ซอง/ขวด'
          // 'มูลค่าคงเหลือ'
        ],
        ...[
          ...balance
          // , balanceSummaryRow
        ].map(it => [
          it.productId,
          it.productName,
          q(it.balanceGoodByUnit, 'CTN'),
          q(it.balanceGoodByUnit, 'BAG', 'PAC'),
          q(it.balanceGoodByUnit, 'PCS', 'BOT'),
          q(it.balanceM3ByUnit, 'CTN'),
          q(it.balanceM3ByUnit, 'BAG', 'PAC'),
          q(it.balanceM3ByUnit, 'PCS', 'BOT'),
          q(it.balanceDamagedByUnit, 'CTN'),
          q(it.balanceDamagedByUnit, 'BAG', 'PAC'),
          q(it.balanceDamagedByUnit, 'PCS', 'BOT'),
          it.totalPrice
        ])
      ]

      // สร้างชีทก่อน แล้วค่อย merge + ตั้งความกว้าง
      const wsBalance = xlsx.utils.aoa_to_sheet(balanceRows)

      wsBalance['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, // A1:A2 รหัส
        { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }, // B1:B2 ชื่อสินค้า
        { s: { r: 0, c: 2 }, e: { r: 0, c: 4 } }, // C1:E1 จำนวนคงเหลือดี
        { s: { r: 0, c: 5 }, e: { r: 0, c: 7 } }, // F1:H1 จำนวนคงจากM3
        { s: { r: 0, c: 8 }, e: { r: 0, c: 10 } }, // I1:K1 จำนวนคงเหลือเสีย
        { s: { r: 0, c: 11 }, e: { r: 1, c: 11 } } // L1:L2 มูลค่าคงเหลือ
      ]

      wsBalance['!cols'] = [
        { wch: 14 },
        { wch: 40 }, // A,B
        { wch: 8 },
        { wch: 10 },
        { wch: 10 }, // C,D,E
        { wch: 8 },
        { wch: 10 },
        { wch: 10 }, // F,G,H
        { wch: 8 },
        { wch: 10 },
        { wch: 10 }, // I,J,K
        { wch: 16 } // L
      ]

      const wb = xlsx.utils.book_new()
      xlsx.utils.book_append_sheet(wb, wsIn, 'stockIn')
      // xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(stockInThai), 'stockIn');
      // xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(stockOutThai), 'stockOut');
      xlsx.utils.book_append_sheet(wb, wsOut, 'stockOut')
      xlsx.utils.book_append_sheet(wb, wsBalance, 'balance')

      const tempPath = path.join(os.tmpdir(), `Stock_${area}_${period}.xlsx`)
      xlsx.writeFile(wb, tempPath)
      return res.download(tempPath, `Stock_${area}_${period}.xlsx`, err => {
        if (err) {
          console.error('❌ Download error:', err)
          if (!res.headersSent) res.status(500).send('Download failed')
        }
        fs.unlink(tempPath, () => {})
      })
    }

    // JSON (ไม่แนบแถวสรุป balance ซ้ำ)
    return res.status(200).json({
      status: 200,
      message: 'successfully',
      data: {
        // stock in
        stockInSummedFinal,
        sumStockIn,
        sumStockInGood,
        sumStockInDamaged,
        sumStockInCredit,
        sumStockInsumStock,
        sumStockInsummary,

        // stock out (merge แล้ว)
        stockOut: stockOutDataFinal,
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

        // balance
        balance,
        sumBalanceGood,
        sumBalanceM3,
        sumBalanceDamaged,
        sumBalancesummary
      }
    })
  } catch (err) {
    console.error('stockToExcelNew error:', err)
    if (!res.headersSent) {
      res.status(500).json({ status: 500, message: 'internal error' })
    }
  }
}

exports.stockToExcelSummary = async (req, res) => {
  try {
    const { area, period, excel } = req.body
    const channel = req.headers['x-channel']
    if (!area || !period) {
      return res
        .status(400)
        .json({ status: 400, message: 'area, period are required' })
    }

    const convertToUnits = (totalPcs, units) => {
      let remaining = totalPcs
      return units.map(u => {
        const qty = Math.floor(remaining / u.factor)

        const price = u.price.sale
        remaining = remaining % u.factor
        return {
          unit: u.unit,
          unitName: u.name,
          qty,
          price: qty * price
        }
      })
    }

    // ---------- Models ----------
    const { Stock, AdjustStock } = getModelsByChannel(channel, res, stockModel)
    const { Distribution } = getModelsByChannel(channel, res, distributionModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { Giveaway } = getModelsByChannel(channel, res, giveModel)

    const [
      dataRefund,
      dataOrderSale,
      dataOrderChange,
      dataWithdraw,
      dataStockListOnly,
      dataGive,
      dataAdjustStock
    ] = await Promise.all([
      Refund.find({
        'store.area': area,
        period,
        status: { $in: ['completed', 'approved'] },
        type: 'refund'
      }).lean(),
      Order.find({
        'store.area': area,
        period,
        type: 'sale',
        status: { $in: ['pending', 'completed'] }
      }).lean(),
      Order.find({
        'store.area': area,
        period,
        type: 'change',
        status: { $in: ['approved', 'completed'] }
      }).lean(),
      Distribution.find({
        area,
        period,
        status: { $in: ['confirm'] },
        type: 'withdraw'
      }).lean(),
      Stock.find({ area, period }).select('listProduct').lean(),
      Giveaway.find({
        'store.area': area,
        period,
        status: { $in: ['pending', 'approved', 'completed'] },
        type: 'give'
      }).lean(),
      AdjustStock.find({
        area: area,
        period,
        status: { $in: ['approved', 'completed'] },
        type: 'adjuststock'
      }).lean()
    ])

    // ---------- Promotions ใน order sale ----------
    const dataOrderPromotion = dataOrderSale.flatMap(item =>
      (item.listPromotions || []).map(u => ({
        _id: u?._id,
        listProduct: u?.listProduct || []
      }))
    )

    // console.log(dataAdjustStock)

    // ---------- Unique product ids (ทุกแหล่งที่เกี่ยว) ----------
    const productIdUsed = [
      ...dataOrderSale.flatMap(x => (x.listProduct || []).map(i => i.id)),
      ...dataRefund.flatMap(x => (x.listProduct || []).map(i => i.id)),
      ...dataOrderChange.flatMap(x => (x.listProduct || []).map(i => i.id)),
      ...dataWithdraw.flatMap(x => (x.listProduct || []).map(i => i.id)),
      ...dataGive.flatMap(x => (x.listProduct || []).map(i => i.id)),
      ...dataOrderPromotion.flatMap(x => (x.listProduct || []).map(i => i.id)),
      ...dataStockListOnly.flatMap(s =>
        (s.listProduct || []).map(i => i.productId)
      ),
      ...dataAdjustStock.flatMap(x => (x.listProduct || []).map(i => i.id))
    ]
      .filter(Boolean)
      .map(s => String(s).trim())

    const uniqueProductId = [...new Set(productIdUsed)]

    // ---------- Product detail (เฉพาะที่จำเป็น) ----------
    const productDetail = await Product.find(
      { id: { $in: uniqueProductId } },
      { id: 1, name: 1, listUnit: 1, groupCodeM3: 1, size: 1 }
    ).lean()

    // Fast lookup
    const prodById = new Map(
      (productDetail || []).map(p => [String(p.id).trim(), p])
    )

    const getFactor = (productId, unit) => {
      const pid = String(productId ?? '').trim()
      const u = String(unit ?? '').trim()
      const prod = prodById.get(pid)
      const unitInfo = prod?.listUnit?.find(
        x => String(x.unit ?? '').trim() === u
      )
      return Number(unitInfo?.factor) || 1
    }

    // ---------- Stock OUT ----------
    const buildRowsFromListProduct = (source, sourceName) => {
      const rows = []
      for (const item of source ?? []) {
        if (!Array.isArray(item?.listProduct)) continue

        for (const p of item.listProduct) {
          if (p.receiveQty === 0) {
            continue
          }
          const qtyPCS = (Number(p?.qty) || 0) * getFactor(p?.id, p?.unit)

          const row = {
            productId: p?.id,
            productName: p?.name,
            qtySale: 0,
            valSale: 0,
            qtyPromo: 0,
            valPromo: 0,
            qtyChange: 0,
            valChange: 0,
            qtyGive: 0,
            valGive: 0,
            qtyGood: 0,
            valGood: 0,
            qtyDamaged: 0,
            valDamaged: 0,
            qtyWithdraw: 0,
            valWithdraw: 0,
            qtyAdjuststock: 0,
            valAdjuststock: 0
          }

          if (sourceName === 'Sale') {
            row.qtySale = qtyPCS
            row.valSale = Number(p?.subtotal ?? 0)
          } else if (sourceName === 'Change') {
            row.qtyChange = qtyPCS
            row.valChange = Number(p?.netTotal ?? 0)
          } else if (sourceName === 'Give') {
            row.qtyGive = qtyPCS
            row.valGive = Number(p?.total ?? 0)
          } else if (sourceName === 'Refund') {
            if (
              sourceName === 'Refund' &&
              String(p?.condition ?? '').toLowerCase() === 'damaged'
            ) {
              row.qtyDamaged = qtyPCS
              row.valDamaged = Number(p?.total ?? 0)
            } else if (
              sourceName === 'Refund' &&
              String(p?.condition ?? '').toLowerCase() === 'good'
            ) {
              row.qtyGood = qtyPCS
              row.valGood = Number(p?.total ?? 0)
            }
          } else if (sourceName === 'Withdraw') {
            const qtyPCSWithdraw =
              (Number(p?.receiveQty) || 0) * getFactor(p?.id, p?.unit)

            row.qtyWithdraw = qtyPCSWithdraw
            row.valWithdraw = Number(p?.total ?? 0)
          } else if (sourceName === 'Adjuststock') {
            // console.log(p?.qty)
            row.qtyAdjuststock = qtyPCS
            row.valAdjuststock = 0
          }

          rows.push(row)
        }
      }
      return rows
    }
    const getPromoValue = (productId, unit, qty) => {
      const pid = String(productId ?? '').trim()
      const u = String(unit ?? '').trim()
      const prod = prodById.get(pid)
      const unitInfo = prod?.listUnit?.find(
        x => String(x.unit ?? '').trim() === u
      )
      const price = Number(unitInfo?.price?.sale) || 0
      return (Number(qty) || 0) * price
    }

    const buildRowsPromotionFromSale = saleOrders => {
      const rows = []
      for (const item of saleOrders) {
        const customerCode = item?.store?.storeId ?? ''
        const customerName = item?.store?.name ?? ''
        const inv = item?.orderId ?? item?.invNo ?? item?.refNo ?? ''
        if (!Array.isArray(item?.listPromotions)) continue

        for (const promo of item.listPromotions) {
          if (!Array.isArray(promo?.listProduct)) continue
          for (const p of promo.listProduct) {
            const qtyPCS = (Number(p?.qty) || 0) * getFactor(p?.id, p?.unit)
            rows.push({
              customerCode,
              customerName,
              inv,
              productId: p?.id,
              productName: p?.name,
              qtySale: 0,
              valSale: 0,
              qtyPromo: qtyPCS,
              valPromo: Number(
                p?.subtotal ?? getPromoValue(p?.id, p?.unit, p?.qty)
              ),
              qtyChange: 0,
              valChange: 0,
              qtyGive: 0,
              valGive: 0,
              qtyGood: 0,
              valGood: 0,
              qtyDamaged: 0,
              valDamaged: 0,
              qtyWithdraw: 0,
              valWithdraw: 0,
              qtyAdjuststock: 0,
              valAdjuststock: 0
            })
          }
        }
      }
      return rows
    }

    const stockOutDataRaw = [
      ...buildRowsFromListProduct(dataOrderSale, 'Sale'),
      ...buildRowsFromListProduct(dataOrderChange, 'Change'),
      ...buildRowsFromListProduct(dataGive, 'Give'),
      ...buildRowsPromotionFromSale(dataOrderSale),
      ...buildRowsFromListProduct(dataRefund, 'Refund'),
      ...buildRowsFromListProduct(dataWithdraw, 'Withdraw'),
      ...buildRowsFromListProduct(dataAdjustStock, 'Adjuststock')
    ]

    // console.log(buildRowsFromListProduct(dataAdjustStock, 'Adjuststock'))

    // รวมซ้ำ: customerCode + customerName + inv + productId
    const mergeDuplicateRows = data => {
      const map = new Map()
      for (const row of data) {
        const key = `${row.productId}`
        if (!map.has(key)) {
          map.set(key, { ...row })
        } else {
          const ex = map.get(key)
          ex.qtySale += row.qtySale
          ex.valSale += row.valSale
          ex.qtyPromo += row.qtyPromo
          ex.valPromo += row.valPromo
          ex.qtyChange += row.qtyChange
          ex.valChange += row.valChange
          ex.qtyGive += row.qtyGive
          ex.valGive += row.valGive
          ex.qtyGood += row.qtyGood
          ex.valGood += row.valGood
          ex.qtyDamaged += row.qtyDamaged
          ex.valDamaged += row.valDamaged
          ex.qtyWithdraw += row.qtyWithdraw
          ex.valWithdraw += row.valWithdraw
          ex.qtyAdjuststock += row.qtyAdjuststock
          ex.valAdjuststock += row.valAdjuststock
        }
      }
      return [...map.values()]
    }

    const stockOutData = mergeDuplicateRows(stockOutDataRaw)

    // (3) ประกอบ balance ต่อสินค้าใน stock
    let stockOutDataFinal = stockOutData.map(item => {
      const pid = String(item?.productId || '').trim()
      const productDetailItem = productDetail.find(u => u.id == pid)
      const productDetailUnit = productDetailItem?.listUnit || []
      const stockMain = dataStockListOnly[0].listProduct.find(
        u => u.productId == pid
      )

      // console.log(item.qtyAdjuststock)
      const prod = prodById.get(pid)
      const sumOutUnit =
        (item.qtySale || 0) +
        (item.qtyPromo || 0) +
        (item.qtyChange || 0) +
        (item.qtyGive || 0) +
        (item.qtyGood || 0) +
        (item.qtyDamaged || 0) +
        (item.qtyWithdraw || 0) +
        (item.qtyAdjuststock || 0)

      const qtyGood = Number(item?.qtyGood ?? 0)
      const qtyDamaged = Number(item?.qtyDamaged ?? 0)
      const outUnit = convertToUnits(sumOutUnit, productDetailUnit)
      const totalPrice = outUnit.reduce(
        (sum, u) => sum + (Number(u.price) || 0),
        0
      )

      // console.log("pid", pid)
      return {
        // customerCode: item.customerCode,
        // customerName: item.customerName,
        // inv: item.inv,
        productId: pid,
        productName: prod?.name || '',
        productGroup: prod?.groupCodeM3 || '',
        size: prod?.size || '',
        mainPcs: stockMain?.stockPcs || 0,
        mainUnit: convertToUnits(stockMain?.stockPcs || 0, productDetailUnit),
        withdrawPcs: item.qtyWithdraw,
        withdrawUnit: convertToUnits(item.qtyWithdraw, productDetailUnit),
        goodPcs: qtyGood,
        goodUnit: convertToUnits(qtyGood, productDetailUnit),
        damagedPcs: qtyDamaged,
        damagedUnit: convertToUnits(qtyDamaged, productDetailUnit),
        salePcs: item.qtySale,
        saleUnit: convertToUnits(item.qtySale, productDetailUnit),
        promoPcs: item.qtyPromo,
        promoUnit: convertToUnits(item.qtyPromo, productDetailUnit),
        changePcs: item.qtyChange,
        changeUnit: convertToUnits(item.qtyChange, productDetailUnit),
        adjustStockPcs: item.qtyAdjuststock,
        adjustStockUnit: convertToUnits(item.qtyAdjuststock, productDetailUnit),
        givePcs: item.qtyGive,
        giveUnit: convertToUnits(item.qtyGive, productDetailUnit),
        balancePcs: stockMain.balancePcs,
        balanceUnit: convertToUnits(stockMain.balancePcs, productDetailUnit),
        sumOut: sumOutUnit,
        outUnit: outUnit,
        totalPrice: totalPrice
      }
    })

    stockOutDataFinal = sortProduct(stockOutDataFinal, 'productGroup')

    // ---------- Export / JSON ----------
    if (excel === true) {
      const q = (arr, ...aliases) => {
        if (!arr?.length) return '-'

        const wanted = new Set(aliases.map(u => String(u).toUpperCase()))

        const total = arr.reduce(
          (sum, x) =>
            wanted.has(String(x.unit).toUpperCase())
              ? sum + (Number(x.qty) || 0)
              : sum,
          0
        )

        return total === 0 ? '-' : total
      }

      const GROUPS = [
        'ต้นทริป',
        'เบิกระหว่างทริป',
        'รับคืนดี',
        'รับคืนเสีย',
        'ขาย',
        'แถม',
        'เปลี่ยน',
        'คืนสต๊อก',
        'ตัดแจก',
        'คงเหลือ'
      ]

      // สร้าง inRows (ถ้าคุณมีอยู่แล้ว ใช้ของเดิมได้ แต่ต้องใส่ค่า "หน่วย" ให้ครบคอลัมน์สุดท้าย)
      const inRows = [
        [
          'รหัส',
          'ชื่อสินค้า',
          ...GROUPS.flatMap(g => [g, '', '']),
          'รวม ซอง/ขวด คงเหลือ'
          // 'รวม ซอง/ขวด ต้นทริป',
          // 'รวม ซอง/ขวด เบิกระหว่างทริป',
          // 'รวม ซอง/ขวด รับคืนดี',
          // 'รวม ซอง/ขวด รับคืนเสีย',
          // 'รวม ซอง/ขวด ขาย',
          // 'รวม ซอง/ขวด แถม',
          // 'รวม ซอง/ขวด เปลี่ยน',
          // 'รวม ซอง/ขวด คืนสต๊อก',
          // 'รวม ซอง/ขวด ตัดแจก'
        ],
        [
          'รหัส',
          'ชื่อสินค้า',
          ...GROUPS.flatMap(() => ['หีบ', 'แพค/ถุง', 'ซอง/ขวด'])
          // 'รวม ซอง/ขวด คงเหลือ'
        ],
        ...stockOutDataFinal.map(it => [
          it.productId,
          it.productName,

          // 10 กลุ่ม × 3 คอลัมน์
          q(it.mainUnit, 'CTN'),
          q(it.mainUnit, 'BAG', 'PAC'),
          q(it.mainUnit, 'PCS', 'BOT'),
          q(it.withdrawUnit, 'CTN'),
          q(it.withdrawUnit, 'BAG', 'PAC'),
          q(it.withdrawUnit, 'PCS', 'BOT'),
          q(it.goodUnit, 'CTN'),
          q(it.goodUnit, 'BAG', 'PAC'),
          q(it.goodUnit, 'PCS', 'BOT'),
          q(it.damagedUnit, 'CTN'),
          q(it.damagedUnit, 'BAG', 'PAC'),
          q(it.damagedUnit, 'PCS', 'BOT'),
          q(it.saleUnit, 'CTN'),
          q(it.saleUnit, 'BAG', 'PAC'),
          q(it.saleUnit, 'PCS', 'BOT'),
          q(it.promoUnit, 'CTN'),
          q(it.promoUnit, 'BAG', 'PAC'),
          q(it.promoUnit, 'PCS', 'BOT'),
          q(it.changeUnit, 'CTN'),
          q(it.changeUnit, 'BAG', 'PAC'),
          q(it.changeUnit, 'PCS', 'BOT'),
          q(it.adjustStockUnit, 'CTN'),
          q(it.adjustStockUnit, 'BAG', 'PAC'),
          q(it.adjustStockUnit, 'PCS', 'BOT'),
          q(it.giveUnit, 'CTN'),
          q(it.giveUnit, 'BAG', 'PAC'),
          q(it.giveUnit, 'PCS', 'BOT'),
          q(it.balanceUnit, 'CTN'),
          q(it.balanceUnit, 'BAG', 'PAC'),
          q(it.balanceUnit, 'PCS', 'BOT'),

          // คอลัมน์สุดท้าย "หน่วย" — ใส่ชื่อหน่วยที่อยากโชว์ (เลือก field ที่มีในสินค้าคุณ)
          it.balancePcs
          // (it.mainPcs),
          // (it.withdrawPcs),
          // (it.goodPcs),
          // (it.damagedPcs),
          // (it.salePcs),
          // (it.promoPcs),
          // (it.changePcs),
          // (it.adjustStockPcs),
          // (it.givePcs),
        ])
      ]

      // สร้างชีท

      const wsIn = xlsx.utils.aoa_to_sheet(inRows)

      // คำนวน merges ให้ตรงกับจำนวนคอลัมน์ที่แท้จริง
      const merges = [
        { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, // A1:A2 (รหัส)
        { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }, // B1:B2 (ชื่อสินค้า)
        // กลุ่ม 10 ชุด × 3 คอลัมน์
        ...GROUPS.map((_, i) => {
          const startC = 2 + i * 3 // เริ่มหลังคอลัมน์ที่ 2
          const endC = startC + 2 // กิน 3 คอลัมน์
          return { s: { r: 0, c: startC }, e: { r: 0, c: endC } }
        }),
        // "หน่วย" คอลัมน์สุดท้าย (merge ลงสองแถว)
        {
          s: { r: 0, c: 2 + GROUPS.length * 3 },
          e: { r: 1, c: 2 + GROUPS.length * 3 }
        }
      ]
      wsIn['!merges'] = merges

      // ตั้งความกว้างคอลัมน์แบบไดนามิก
      const cols = []
      cols[0] = { wch: 14 } // รหัส
      cols[1] = { wch: 40 } // ชื่อสินค้า
      for (let i = 0; i < GROUPS.length * 3; i++) {
        cols[2 + i] = { wch: 10 } // คอลัมน์ตัวเลข
      }
      cols[2 + GROUPS.length * 3] = { wch: 10 } // "หน่วย"
      wsIn['!cols'] = cols

      const wb = xlsx.utils.book_new()
      xlsx.utils.book_append_sheet(wb, wsIn, 'stockSummary')
      const tempPath = path.join(os.tmpdir(), `Stock_${area}_${period}.xlsx`)
      xlsx.writeFile(wb, tempPath)
      return res.download(tempPath, `Stock_${area}_${period}.xlsx`, err => {
        if (err) {
          console.error('❌ Download error:', err)
          if (!res.headersSent) res.status(500).send('Download failed')
        }
        fs.unlink(tempPath, () => {})
      })
    } else {
      return res.status(200).json({
        status: 200,
        message: 'Sucess',
        // data:buildRowsFromListProduct(dataRefund, 'Refund'),
        stockOutDataFinal
      })
    }
  } catch (error) {
    console.error('error:', error)
    return res.status(500).json({
      status: 500,
      message: 'Internal server error'
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

exports.addStockWithdraw = async (req, res) => {
  const { area, productId, qty, unit, period, type } = req.body
  const channel = req.headers['x-channel']
  // const { Product } = getModelsByChannel(channel, res, productModel)
  // const { Stock } = getModelsByChannel(channel, res, stockModel)

  item = {
    id: productId,
    qty: qty,
    unit: unit
  }
  if (type === 'add') {
    const updateResult = await updateStockMongo(
      item,
      area,
      period,
      'withdraw',
      channel,
      res
    )
    if (updateResult) return
  } else if (type === 'reduce') {
    const updateResult = await updateStockMongo(
      item,
      area,
      period,
      'reduceWithdraw',
      channel,
      res
    )
    if (updateResult) return
  }

  return res.status(200).json({
    status: 200,
    message: 'add stock successfully'
  })
}

exports.checkStockWithdraw = async (req, res) => {
  const { area, period } = req.body
  const channel = req.headers['x-channel']
  const { Stock } = getModelsByChannel(channel, res, stockModel)
  const { Product } = getModelsByChannel(channel, res, productModel)
  const { Refund } = getModelsByChannel(channel, res, refundModel)
  const { AdjustStock } = getModelsByChannel(channel, res, adjustStockModel)
  const { Distribution } = getModelsByChannel(channel, res, distributionModel)
  const { Order } = getModelsByChannel(channel, res, orderModel)
  const { Giveaway } = getModelsByChannel(channel, res, giveModel)

  // --- สร้าง query ---
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

  // --- Query ข้อมูล ---
  const dataRefund = await Refund.aggregate([
    {
      $match: {
        ...matchQueryRefund,
        status: { $in: ['completed', 'approved'] }
      }
    },
    { $project: { listProduct: 1, _id: 0 } }
  ])

  const dataWithdraw = await Distribution.aggregate([
    { $match: { status: 'confirm', ...matchQuery } },
    {
      $project: {
        _id: 0,
        listProduct: {
          $filter: {
            input: '$listProduct',
            as: 'item',
            cond: { $gt: ['$$item.receiveQty', 0] }
          }
        }
      }
    },
    // join ไปที่ products
    {
      $unwind: '$listProduct'
    },
    {
      $lookup: {
        from: 'products',
        localField: 'listProduct.id',
        foreignField: 'id',
        as: 'prod'
      }
    },
    { $unwind: '$prod' },
    // หา factor ที่ unit ตรงกัน
    {
      $set: {
        factor: {
          $let: {
            vars: {
              matched: {
                $first: {
                  $filter: {
                    input: '$prod.listUnit',
                    as: 'u',
                    cond: { $eq: ['$$u.unit', '$listProduct.unit'] }
                  }
                }
              }
            },
            in: { $ifNull: ['$$matched.factor', 1] }
          }
        }
      }
    },
    // คำนวณ qtyPcs
    {
      $set: {
        'listProduct.qtyPcs': {
          $multiply: ['$listProduct.receiveQty', '$factor']
        }
      }
    },
    // กลับมา group รวมใบละรายการ
    {
      $group: {
        _id: '$_id',
        listProduct: { $push: '$listProduct' }
      }
    },
    {
      $project: { _id: 0, listProduct: 1 }
    }
  ])

  const dataOrder = await Order.aggregate([
    { $addFields: { zone: { $substrBytes: ['$area', 0, 2] } } },
    { $match: { type: 'sale', status: { $nin: ['canceled', 'reject'] } } },
    { $match: matchQueryRefund },
    { $project: { listProduct: 1, listPromotions: 1, _id: 0 } }
  ])

  const dataChange = await Order.aggregate([
    { $addFields: { zone: { $substrBytes: ['$area', 0, 2] } } },
    { $match: { type: 'change', status: { $nin: ['canceled', 'reject'] } } },
    { $match: matchQueryRefund },
    { $project: { listProduct: 1, _id: 0 } }
  ])

  const dataAdjust = await AdjustStock.aggregate([
    { $addFields: { zone: { $substrBytes: ['$area', 0, 2] } } },
    { $match: { type: 'adjuststock', status: 'approved' } },
    { $match: matchQuery },
    { $project: { listProduct: 1, _id: 0 } }
  ])

  const dataGive = await Giveaway.aggregate([
    { $addFields: { zone: { $substrBytes: ['$area', 0, 2] } } },
    { $match: { type: 'give', status: { $nin: ['canceled', 'reject'] } } },
    { $match: matchQueryRefund },
    { $project: { listProduct: 1, _id: 0 } }
  ])

  // --- Flatten ---
  const allWithdrawProducts = dataWithdraw.flatMap(doc => doc.listProduct || [])
  // console.log(allWithdrawProducts)
  const allRefundProducts = dataRefund.flatMap(doc =>
    (doc.listProduct || []).filter(item => item.condition === 'good')
  )

  // console.log(allRefundProducts)
  const allOrderProducts = dataOrder.flatMap(doc => doc.listProduct || [])
  const allOrderPromotion = dataOrder.flatMap(doc => doc.listPromotions || [])
  const allChangeProducts = dataChange.flatMap(doc => doc.listProduct || [])
  const allAdjustProducts = dataAdjust.flatMap(doc => doc.listProduct || [])
  const allGiveProducts = dataGive.flatMap(doc => doc.listProduct || [])

  const dataStock = await Stock.aggregate([
    { $addFields: { zone: { $substrBytes: ['$area', 0, 2] } } },
    { $match: matchQuery },
    { $project: { listProduct: 1, _id: 0 } }
  ])
  if (dataStock.length === 0) {
    return res.status(404).json({ status: 404, message: 'Not found this area' })
  }

  // --- รวมข้อมูลเป็น array ---
  const refundProductArray = Object.values(
    allRefundProducts.reduce((acc, curr) => {
      const key = `${curr.id}_${curr.unit}_${curr.condition}`
      if (acc[key]) {
        acc[key].qty += curr.qty || 0
        acc[key].qtyPcs += curr.qtyPcs || 0
      } else {
        acc[key] = { ...curr }
      }
      return acc
    }, {})
  )

  const withdrawProductArray = Object.values(
    allWithdrawProducts.reduce((acc, curr) => {
      const key = `${curr.id}_${curr.unit}`
      if (acc[key]) {
        acc[key].qty += curr.qty || 0
        acc[key].qtyPcs += curr.qtyPcs || 0
      } else {
        acc[key] = { ...curr }
      }
      return acc
    }, {})
  )

  // const filteredWithdraw = withdrawProductArray.filter(p => p.id === '10011101002');

  // console.log(filteredWithdraw);

  const orderProductArray = Object.values(
    allOrderProducts.reduce((acc, curr) => {
      const key = `${curr.id}_${curr.unit}`
      if (acc[key]) {
        acc[key].qty += curr.qty || 0
        acc[key].qtyPcs += curr.qtyPcs || 0
      } else {
        acc[key] = { ...curr }
      }
      return acc
    }, {})
  )

  const mergedProductPromotions = allOrderPromotion.reduce((acc, promo) => {
    promo.listProduct.forEach(prod => {
      const key = `${prod.id}_${prod.unit}`
      if (acc[key]) {
        acc[key].qty += prod.qty || 0
        acc[key].qtyPcs += prod.qtyPcs || 0
      } else {
        acc[key] = { ...prod }
      }
    })
    return acc
  }, {})
  const orderPromotionArray = Object.values(mergedProductPromotions)

  const changeProductArray = Object.values(
    allChangeProducts.reduce((acc, curr) => {
      const key = `${curr.id}_${curr.unit}`
      if (acc[key]) {
        acc[key].qty += curr.qty || 0
        acc[key].qtyPcs += curr.qtyPcs || 0
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
        acc[key].qty += curr.qty || 0
        acc[key].qtyPcs += curr.qtyPcs || 0
      } else {
        acc[key] = { ...curr }
      }
      return acc
    }, {})
  )

  const giveProductArray = Object.values(
    allGiveProducts.reduce((acc, curr) => {
      const key = `${curr.id}_${curr.unit}`
      if (acc[key]) {
        acc[key].qty += curr.qty || 0
        acc[key].qtyPcs += curr.qtyPcs || 0
      } else {
        acc[key] = { ...curr }
      }
      return acc
    }, {})
  )

  // --- รวม stock ---
  const allProducts = dataStock.flatMap(item => item.listProduct)
  const uniqueProductId = [
    ...new Set([
      ...allProducts.map(p => p.productId),
      ...withdrawProductArray.map(p => p.id),
      ...refundProductArray.map(p => p.id),
      ...orderProductArray.map(p => p.id),
      ...orderPromotionArray.map(p => p.id),
      ...changeProductArray.map(p => p.id),
      ...adjustProductArray.map(p => p.id),
      ...giveProductArray.map(p => p.id)
    ])
  ]
  const haveProductIdSet = new Set(allProducts.map(p => p.productId))
  uniqueProductId.forEach(productId => {
    if (!haveProductIdSet.has(productId)) {
      allProducts.push({
        productId,
        stockPcs: 0,
        balancePcs: 0,
        stockCtn: 0,
        balanceCtn: 0,
        stockInPcs: 0
      })
    }
  })

  const sumById = {}
  for (const u of allProducts) {
    const id = u.productId
    if (!sumById[id]) {
      sumById[id] = {
        id,
        stockPcs: u.stockPcs || 0,
        balancePcs: u.balancePcs || 0,
        stockCtn: u.stockCtn || 0,
        balanceCtn: u.balanceCtn || 0,
        stockInPcs: u.stockInPcs || 0
      }
    } else {
      sumById[id].stockPcs += u.stockPcs || 0
      sumById[id].balancePcs += u.balancePcs || 0
      sumById[id].stockCtn += u.stockCtn || 0
      sumById[id].balanceCtn += u.balanceCtn || 0
      sumById[id].stockInPcs += u.stockInPcs || 0
    }
  }
  const productSum = Object.values(sumById)

  // --- ดึงข้อมูลสินค้า ---
  const dataProduct = await Product.find({
    id: { $in: uniqueProductId }
  }).select('id name listUnit')

  // --- สร้าง output ---
  let data = []
  for (const stockItem of productSum) {
    const productDetail = dataProduct.find(u => u.id == stockItem.id)
    if (!productDetail) continue

    const pcsMain = stockItem.stockPcs
    let stock = stockItem.stockPcs
    let balance = stockItem.balancePcs
    let stockIn = stockItem.stockInPcs

    const listUnitStock = productDetail.listUnit.map(u => {
      const goodQty =
        refundProductArray.find(
          i =>
            i.id === stockItem.id && i.unit === u.unit && i.condition === 'good'
        )?.qty ?? 0
      // console.log(withdrawProductArray)
      const withdrawPcsTotal = withdrawProductArray
        .filter(i => i.id === stockItem.id)
        .reduce((sum, i) => sum + (i.qtyPcs || 0), 0)

      const goodPcsTotal = refundProductArray
        .filter(i => i.id === stockItem.id)
        .reduce((sum, i) => sum + (i.qtyPcs || 0), 0)

      const withdrawQty = Math.floor(withdrawPcsTotal / u.factor) || 0
      const goodQtyNew = Math.floor(goodPcsTotal / u.factor) || 0
      const factor = u.factor
      const stockQty = Math.floor(stock / factor) || 0
      const balanceQty = Math.floor(balance / factor) || 0
      const stockInCal = Math.floor(stockIn / factor) || 0

      stock -= stockQty * factor
      balance -= balanceQty * factor
      // console.log(goodQty)
      return {
        unit: u.unit,
        unitName: u.name,
        withdraw: withdrawQty,
        good: goodQtyNew,
        withdrawGood: withdrawQty + goodQtyNew,
        stockIn: stockInCal,
        diff: withdrawQty + goodQtyNew - stockInCal
      }
    })

    // ✅ กรองเฉพาะที่ withdrawGood != stockIn
    const filteredListUnit = listUnitStock.filter(
      u => u.withdrawGood !== u.stockIn
    )

    if (filteredListUnit.length > 0) {
      data.push({
        productId: stockItem.id,
        productName: productDetail.name,
        pcsMain,
        listUnit: filteredListUnit
      })
    }

    data.sort((a, b) => b.pcsMain - a.pcsMain)
    data.forEach(item => delete item.pcsMain)
  }
  res.status(200).json({ status: 200, message: 'suceesful', data })
}

exports.addStockAllWithInOut = async (req, res) => {
  try {
    const { period, area } = req.body // << ต้องส่งมาด้วย
    const channel = req.headers['x-channel']

    const { Stock } = getModelsByChannel(channel, res, stockModel)
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Refund } = getModelsByChannel(channel, res, refundModel)
    const { AdjustStock } = getModelsByChannel(channel, res, adjustStockModel)
    const { Distribution } = getModelsByChannel(channel, res, distributionModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Giveaway } = getModelsByChannel(channel, res, giveModel)
    const { User } = getModelsByChannel(channel, res, userModel)
    const { Cart } = getModelsByChannel(channel, res, cartModel)

    const { startDate, endDate } = rangeDate(period)

    // console.log(startDate,endDate)
    if (!period) {
      return res
        .status(400)
        .json({ status: 400, message: 'period is required' })
    }

    if (!area) {
      const userData = await User.find({ role: 'sale' }).select('area')
      const rawAreas = userData
        .flatMap(u => (Array.isArray(u.area) ? u.area : [u.area]))
        .filter(Boolean)
      uniqueAreas = [...new Set(rawAreas)]
    } else if (area) {
      uniqueAreas = [area]
    }

    // 2) ฟังก์ชันย่อย: ประมวลผลต่อ 1 area
    const buildAreaStock = async area => {
      // สร้าง match สำหรับ collections ต่าง ๆ
      let areaQuery = {}
      if (area) {
        if (area.length === 2) areaQuery.zone = area.slice(0, 2)
        else if (area.length === 5) areaQuery.area = area
      }

      let areaQueryRefund = {}
      if (area) {
        if (area.length === 2) areaQueryRefund['store.zone'] = area.slice(0, 2)
        else if (area.length === 5) areaQueryRefund['store.area'] = area
      }

      const matchQuery = { ...areaQuery, period }
      const matchQueryRefund = { ...areaQueryRefund, period }

      const dataRefund = await Refund.aggregate([
        {
          $match: {
            ...matchQueryRefund,
            status: { $in: ['completed', 'approved'] }
          }
        },
        { $project: { listProduct: 1, _id: 0 } }
      ])

      const dataWithdraw = await Distribution.aggregate([
        { $match: { status: 'confirm', ...matchQuery } },
        {
          $project: {
            _id: 0,
            listProduct: {
              $filter: {
                input: '$listProduct',
                as: 'item',
                cond: { $gt: ['$$item.receiveQty', 0] }
              }
            }
          }
        },
        { $unwind: '$listProduct' },
        {
          $lookup: {
            from: 'products',
            localField: 'listProduct.id',
            foreignField: 'id',
            as: 'prod'
          }
        },
        { $unwind: '$prod' },
        {
          $set: {
            factor: {
              $let: {
                vars: {
                  matched: {
                    $first: {
                      $filter: {
                        input: '$prod.listUnit',
                        as: 'u',
                        cond: { $eq: ['$$u.unit', '$listProduct.unit'] }
                      }
                    }
                  }
                },
                in: { $ifNull: ['$$matched.factor', 1] }
              }
            }
          }
        },
        {
          $set: {
            'listProduct.qtyPcs': {
              $multiply: ['$listProduct.receiveQty', '$factor']
            }
          }
        },
        { $group: { _id: '$_id', listProduct: { $push: '$listProduct' } } },
        { $project: { _id: 0, listProduct: 1 } }
      ])

      const dataOrder = await Order.aggregate([
        { $addFields: { zone: { $substrBytes: ['$area', 0, 2] } } },
        { $match: { type: 'sale', status: { $ne: 'canceled' } } },
        { $match: matchQueryRefund },
        { $project: { listProduct: 1, listPromotions: 1, _id: 0 } }
      ])

      const dataChange = await Order.aggregate([
        { $addFields: { zone: { $substrBytes: ['$area', 0, 2] } } },
        {
          $match: { type: 'change', status: { $in: ['approved', 'completed'] } }
        },
        { $match: matchQueryRefund },
        { $project: { listProduct: 1, _id: 0 } }
      ])

      const dataAdjust = await AdjustStock.aggregate([
        { $addFields: { zone: { $substrBytes: ['$area', 0, 2] } } },
        {
          $match: {
            type: 'adjuststock',
            status: { $in: ['approved', 'completed'] }
          }
        },
        { $match: matchQuery },
        { $project: { listProduct: 1, _id: 0 } }
      ])

      const dataGive = await Giveaway.aggregate([
        { $addFields: { zone: { $substrBytes: ['$area', 0, 2] } } },
        { $match: { type: 'give', status: { $nin: ['canceled', 'reject'] } } },
        { $match: matchQueryRefund },
        { $project: { listProduct: 1, _id: 0 } }
      ])

      const dataCart = await Cart.aggregate([
        {
          $match: {
            type: { $in: ['give', 'refund', 'sale'] },
            area,
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        { $project: { listProduct: 1, _id: 0, zone: 1 } }
      ])

      const dataChangePending = await Order.aggregate([
        { $addFields: { zone: { $substrBytes: ['$area', 0, 2] } } },
        { $match: { type: 'change', status: 'pending' } },
        { $match: matchQueryRefund },
        { $project: { listProduct: 1, _id: 0 } }
      ])

      const allWithdrawProducts = dataWithdraw.flatMap(
        doc => doc.listProduct || []
      )
      const allRefundProducts = dataRefund.flatMap(doc => doc.listProduct || [])
      const allOrderProducts = dataOrder.flatMap(doc => doc.listProduct || [])
      const allOrderPromotion = dataOrder.flatMap(
        doc => doc.listPromotions || []
      )
      const allChangeProducts = dataChange.flatMap(doc => doc.listProduct || [])
      const allAdjustProducts = dataAdjust.flatMap(doc => doc.listProduct || [])
      const allGiveProducts = dataGive.flatMap(doc => doc.listProduct || [])
      const allCartProducts = dataCart.flatMap(doc => doc.listProduct || [])
      const allChangePendingProducts = dataChangePending.flatMap(
        doc => doc.listProduct || []
      )

      const dataStock = await Stock.aggregate([
        { $addFields: { zone: { $substrBytes: ['$area', 0, 2] } } },
        { $match: matchQuery },
        { $project: { listProduct: 1, _id: 0 } }
      ])

      if (dataStock.length === 0) {
        return {
          area,
          period,
          data: [],
          summaries: null,
          note: 'Not found this area'
        }
      }

      const refundProductArray = Object.values(
        allRefundProducts.reduce((acc, curr) => {
          const key = `${curr.id}_${curr.unit}_${curr.condition}`
          if (acc[key]) {
            acc[key] = {
              ...curr,
              qty: (acc[key].qty || 0) + (curr.qty || 0),
              qtyPcs: (acc[key].qtyPcs || 0) + (curr.qtyPcs || 0)
            }
          } else acc[key] = { ...curr }
          return acc
        }, {})
      )

      const withdrawProductArray = Object.values(
        allWithdrawProducts.reduce((acc, curr) => {
          // สร้าง key สำหรับ group
          const key = `${curr.id}_${curr.unit}`

          // ลบ qty เดิมออกก่อน
          const { qty, ...rest } = curr

          if (acc[key]) {
            // ถ้ามีอยู่แล้ว ให้เพิ่มจากค่าใหม่
            acc[key].qty += curr.receiveQty || 0
            acc[key].qtyPcs += curr.qtyPcs || 0
          } else {
            // ถ้ายังไม่มี ให้สร้างใหม่ พร้อม qty จาก receiveQty
            acc[key] = {
              ...rest,
              qty: curr.receiveQty || 0,
              qtyPcs: curr.qtyPcs || 0
            }
          }
          return acc
        }, {})
      )

      const orderProductArray = Object.values(
        allOrderProducts.reduce((acc, curr) => {
          const key = `${curr.id}_${curr.unit}`
          if (acc[key]) {
            acc[key] = {
              ...curr,
              qty: (acc[key].qty || 0) + (curr.qty || 0),
              qtyPcs: (acc[key].qtyPcs || 0) + (curr.qtyPcs || 0)
            }
          } else acc[key] = { ...curr }
          return acc
        }, {})
      )

      const mergedProductPromotions = allOrderPromotion.reduce((acc, promo) => {
        ;(promo.listProduct || []).forEach(prod => {
          const key = `${prod.id}_${prod.unit}`
          if (acc[key]) {
            acc[key].qty += prod.qty || 0
            acc[key].qtyPcs += prod.qtyPcs || 0
          } else {
            acc[key] = { ...prod, qty: prod.qty || 0, qtyPcs: prod.qtyPcs || 0 }
          }
        })
        return acc
      }, {})
      const orderPromotionArray = Object.values(mergedProductPromotions)

      const changeProductArray = Object.values(
        allChangeProducts.reduce((acc, curr) => {
          const key = `${curr.id}_${curr.unit}`
          if (acc[key]) {
            acc[key] = {
              ...curr,
              qty: (acc[key].qty || 0) + (curr.qty || 0),
              qtyPcs: (acc[key].qtyPcs || 0) + (curr.qtyPcs || 0)
            }
          } else acc[key] = { ...curr }
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
          } else acc[key] = { ...curr }
          return acc
        }, {})
      )

      const giveProductArray = Object.values(
        allGiveProducts.reduce((acc, curr) => {
          const key = `${curr.id}_${curr.unit}`
          if (acc[key]) {
            acc[key] = {
              ...curr,
              qty: (acc[key].qty || 0) + (curr.qty || 0),
              qtyPcs: (acc[key].qtyPcs || 0) + (curr.qtyPcs || 0)
            }
          } else acc[key] = { ...curr }
          return acc
        }, {})
      )

      const cartProductArray = Object.values(
        allCartProducts.reduce((acc, curr) => {
          const key = `${curr.id}_${curr.unit}`
          if (acc[key]) {
            acc[key] = {
              ...curr,
              qty: (acc[key].qty || 0) + (curr.qty || 0),
              qtyPcs: (acc[key].qtyPcs || 0) + (curr.qtyPcs || 0)
            }
          } else acc[key] = { ...curr }
          return acc
        }, {})
      )

      const changePendingProductArray = Object.values(
        allChangePendingProducts.reduce((acc, curr) => {
          const key = `${curr.id}_${curr.unit}`
          if (acc[key]) {
            acc[key] = {
              ...curr,
              qty: (acc[key].qty || 0) + (curr.qty || 0),
              qtyPcs: (acc[key].qtyPcs || 0) + (curr.qtyPcs || 0)
            }
          } else acc[key] = { ...curr }
          return acc
        }, {})
      )

      const dataStockTran = dataStock
      const productIdListStock = dataStockTran.flatMap(item =>
        item.listProduct.map(u => u.productId)
      )
      const productIdListWithdraw = withdrawProductArray.flatMap(
        item => item.id
      )
      const productIdListRefund = refundProductArray.flatMap(item => item.id)
      const productIdListOrder = orderProductArray.flatMap(item => item.id)
      const productIdListPromotion = orderPromotionArray.flatMap(
        item => item.id
      )
      const productIdListChange = changeProductArray.flatMap(item => item.id)
      const productIdListAdjust = adjustProductArray.flatMap(item => item.id)
      const productIdListGive = giveProductArray.flatMap(item => item.id)
      const productIdListCart = cartProductArray.flatMap(item => item.id)
      const productIdListChangePending = changePendingProductArray.flatMap(
        item => item.id
      )

      const uniqueProductId = [
        ...new Set([
          ...productIdListStock,
          ...productIdListWithdraw,
          ...productIdListRefund,
          ...productIdListOrder,
          ...productIdListPromotion,
          ...productIdListChange,
          ...productIdListAdjust,
          ...productIdListGive,
          ...productIdListCart,
          ...productIdListChangePending
        ])
      ]

      const allProducts = dataStockTran.flatMap(item => item.listProduct)
      const haveProductIdSet = new Set(allProducts.map(p => p.productId))

      // เติม product ที่ไม่มีใน stock แต่โผล่ในธุรกรรมอื่น
      uniqueProductId.forEach(productId => {
        if (!haveProductIdSet.has(productId)) {
          allProducts.push({
            productId,
            stockPcs: 0,
            balancePcs: 0,
            stockCtn: 0,
            balanceCtn: 0
          })
        }
      })

      // รวมตาม productId
      const sumById = {}
      for (const u of allProducts) {
        const id = u.productId
        if (!sumById[id]) {
          sumById[id] = {
            id,
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
      let summaryStockBalPcs = 0

      for (const stockItem of productSum) {
        const productDetail = dataProduct.find(u => u.id == stockItem.id)
        const productDetailRefund = refundProductArray.filter(
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
        const productDetailGive = giveProductArray.filter(
          u => u.id == stockItem.id
        )

        const productDetailCart = cartProductArray.filter(
          u => u.id == stockItem.id
        )

        const productDetailChangePending = changePendingProductArray.filter(
          u => u.id == stockItem.id
        )

        if (!productDetail) continue

        const pcsMain = stockItem.stockPcs
        let stock = stockItem.stockPcs
        let balance = stockItem.balancePcs
        summaryStockPcs += stockItem.stockPcs || 0
        summaryStockBalPcs += stockItem.balancePcs || 0

        const listUnitStock = productDetail.listUnit.map(u => {
          const goodQty =
            productDetailRefund.find(
              i => i.unit === u.unit && i.condition === 'good'
            )?.qty ?? 0
          const damagedQty =
            productDetailRefund.find(
              i => i.unit === u.unit && i.condition === 'damaged'
            )?.qty ?? 0
          const withdrawQty =
            productDetailWithdraw.find(i => i.unit === u.unit)?.qty ?? 0
          const saleQty =
            productDetailOrder.find(i => i.unit === u.unit)?.qty ?? 0
          const promoQty =
            productDetailPromotion.find(i => i.unit === u.unit)?.qty ?? 0
          const changeQty =
            productDetailChange.find(i => i.unit === u.unit)?.qty ?? 0
          const adjustQty =
            productDetailAdjust.find(i => i.unit === u.unit)?.qty ?? 0
          const giveQty =
            productDetailGive.find(i => i.unit === u.unit)?.qty ?? 0
          const cartQty =
            productDetailCart.find(i => i.unit === u.unit)?.qty ?? 0
          const changePendingQty =
            productDetailChangePending.find(i => i.unit === u.unit)?.qty ?? 0

          const goodSale = u.price?.refund ?? 0
          const damagedSale = u.price?.refundDmg ?? 0
          const changeSale = u.price?.change ?? 0
          const sale = u.price?.sale ?? 0
          const factor = u.factor || 1

          const stockQty = Math.floor((stock || 0) / factor) || 0
          const balanceQty = Math.floor((balance || 0) / factor) || 0

          stock -= stockQty * factor
          balance -= balanceQty * factor

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
            cart: cartQty,
            promotion: promoQty,
            changePending: changePendingQty,
            change: changeQty,
            adjust: adjustQty,
            give: giveQty,
            balance: balanceQty
          }
        })

        const [pcs, ctn] = calculateStockSummary(productDetail, listUnitStock)
        const summaryQty = { PCS: pcs, CTN: ctn }

        data.push({
          productId: stockItem.id,
          productName: productDetail.name,
          pcsMain,
          summaryQty
        })
      }

      // sort + ลบ pcsMain ก่อนส่ง
      data.sort((a, b) => b.pcsMain - a.pcsMain)
      data.forEach(item => {
        delete item.pcsMain
      })

      return {
        area,
        period,
        data
        // summaries: {
        //   summaryStock:       Number(summaryStock.toFixed(2)),
        //   summaryStockBal:    Number(summaryStockBal.toFixed(2)),
        //   summaryWithdraw:    Number(summaryWithdraw.toFixed(2)),
        //   summaryGood:        Number(summaryGood.toFixed(2)),
        //   summaryDamaged:     Number(summaryDamaged.toFixed(2)),
        //   summarySale:        Number(summarySale.toFixed(2)),
        //   summaryPromotion:   Number(summaryPromotion.toFixed(2)),
        //   summaryChange:      Number(summaryChange.toFixed(2)),
        //   summaryAdjust:      Number(summaryAdjust.toFixed(2)),
        //   summaryGive:        Number(summaryGive.toFixed(2)),
        //   summaryStockPcs:    Number(summaryStockPcs.toFixed(2)),
        //   summaryStockBalPcs: Number(summaryStockBalPcs.toFixed(2)),
        // }
      }
    }

    // 3) วนตาม area (จะขนานหรือทีละตัวก็ได้)
    const results = []
    for (const area of uniqueAreas) {
      const r = await buildAreaStock(area)
      results.push(r)
      // console.log(area)
    }

    for (const item of results) {
      for (const i of item.data) {
        const filter = {
          area: item.area,
          period: period,
          'listProduct.productId': i.productId
        }

        const update = {
          $set: {
            'listProduct.$[elem].stockInPcs': i.summaryQty.PCS.in,
            'listProduct.$[elem].stockOutPcs': i.summaryQty.PCS.out,
            'listProduct.$[elem].balancePcs': i.summaryQty.PCS.balance,
            'listProduct.$[elem].stockInCtn': i.summaryQty.CTN.in,
            'listProduct.$[elem].stockOutCtn': i.summaryQty.CTN.out,
            'listProduct.$[elem].balanceCtn': i.summaryQty.CTN.balance
          }
        }

        const options = {
          arrayFilters: [{ 'elem.productId': i.productId }],
          new: true
        }

        // Try update first
        const updatedDoc = await Stock.findOneAndUpdate(filter, update, options)

        // If product not found in listProduct, push a new one
        if (!updatedDoc) {
          await Stock.updateOne(
            { area: item.area, period: period },
            {
              $push: {
                listProduct: {
                  productId: i.productId,
                  stockPcs: 0,
                  stockInPcs: i.summaryQty.PCS.in,
                  stockOutPcs: i.summaryQty.PCS.out,
                  balancePcs: i.summaryQty.PCS.balance,
                  stockCtn: 0,
                  stockInCtn: i.summaryQty.CTN.in,
                  stockOutCtn: i.summaryQty.CTN.out,
                  balanceCtn: i.summaryQty.CTN.balance
                }
              }
            }
          )
        }
      }
    }

    return res.status(200).json({
      status: 200,
      // period,
      // areas: uniqueAreas,
      results // array ของผลลัพธ์ราย area
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ status: 500, message: err.message })
  }
}

exports.addStockIt = async (req, res) => {
  const { period } = req.body
  const channel = req.headers['x-channel']
  const { Product } = getModelsByChannel(channel, res, productModel)
  const { Stock } = getModelsByChannel(channel, res, stockModel)
  const productData = await Product.find({ statusSale: 'Y' })

  const productId = productData.flatMap(item => item.id)

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

  const dataIt = {
    area: 'IT211',
    saleCode: '99999',
    period: period,
    warehouse: '191',
    listProduct: productData.map(item => {
      const stockPcs = 350

      const ctn = factorCtn.find(i => i.id === item.id) || {}
      const factor = Number(ctn?.listUnit?.factor)
      const qtyCtn = factor > 0 ? Math.floor(stockPcs / factor) : 0

      return {
        productId: item.id,
        stockPcs: stockPcs,
        stockInPcs: 0,
        stockOutPcs: 0,
        balancePcs: stockPcs,
        stockCtn: qtyCtn,
        stockInCtn: 0,
        stockOutCtn: 0,
        balanceCtn: qtyCtn
      }
    })
  }

  const existStock = await Stock.findOne({ area: 'IT211', period: period })
  if (existStock) {
    return res.status(200).json({
      status: 209,
      message: `already have IT211 ${period} `
    })
  }

  await Stock.create(dataIt)

  res.status(200).json({
    status: 200,
    message: 'sucess',
    data: dataIt
  })
}
