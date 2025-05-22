// const {
//   Stock,
//   StockMovement,
//   StockMovementLog
// } = require('../../models/cash/stock')
// const { User } = require('../../models/cash/user')
// const { Product } = require('../../models/cash/product')
const path = require('path')
const errorEndpoint = require('../../middleware/errorEndpoint')
const currentFilePath = path.basename(__filename)
const { getStockAvailable } = require('./available')
const { getStockMovement } = require('../../utilities/movement')
const { Warehouse, Locate, Balance } = require('../../models/cash/master')
const { Op } = require('sequelize')
const XLSX = require('xlsx')
// const { Refund } = require('../../models/cash/refund')

const userModel = require('../../models/cash/user')
const productModel = require('../../models/cash/product')
const stockModel = require('../../models/cash/stock')
const { getModelsByChannel } = require('../../middleware/channel')

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

    for (const item of body) {
      const { area, period, listProduct } = item

      if (!area || !Array.isArray(listProduct)) continue

      const user = await User.findOne({ area }).select('saleCode').lean()

      if (!user) {
        return res.status(404).json({
          status: 404,
          message: 'Not Found This Area'
        })
      }

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
        res.status(200).json({
          status: 200,
          message: stockDoc
        })
      }
    }

    // res.status(200).json({
    //     status: 200,
    //     message: stockDoc,
    // })
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
    message: 'Stock added successfully',
    data: test
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

    const productStock = await Stock.find({
      area: area,
      period: period,
      'listProduct.productId': productId
    })
    console.log(productStock)

    const products = await Product.find({ id: productId })

    let unitData = {}

    const productUnitMatch = products?.find(p => p.id === productId)

    if (productUnitMatch) {
      unitData = productUnitMatch.listUnit.map(unit => ({
        unit: unit.unit,
        factor: unit.factor
      }))
    } else {
      res.status(404).json({
        message: 'Not Found This ItemId'
      })
    }

    const stockmatchList = []

    productStock.map(item => {
      const stockmatch = item.listProduct.find(p => p.productId === productId)
      if (stockmatch) {
        stockmatchList.push(stockmatch)
      }
    })

    const qtyList = stockmatchList.flatMap(product =>
      product.available.map(lot => lot.qtyPcs)
    )
    const lotList = stockmatchList.flatMap(product =>
      product.available.map(lot => lot.lot)
    )

    const totalQtyPcs = qtyList.reduce((sum, qty) => sum + qty, 0)

    const productUnit = unitData.find(p => p.unit === unit)

    const lotFirst = lotList[0]

    const data = {
      area: area,
      productId: productId,
      sumQtyPcs: totalQtyPcs,
      qty: Math.floor(totalQtyPcs / productUnit.factor),
      unit: unit,
      lot: lotFirst
    }

    res.status(200).json({
      status: 200,
      message: 'Stock Quantity fetched successfully!',
      data: data
    })
  } catch (error) {
    console.error('Error transforming cart data:', error.message)
    return { status: 500, message: 'Server error' }
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

      // console.log("lot",lot)
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

    res.status(200).json({
      status: 200,
      message: 'Success',
      data: sorted
    })
  } catch (error) {
    next(error)
  }
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
