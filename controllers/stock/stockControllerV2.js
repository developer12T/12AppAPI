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
  stockPcQuery,
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
const { restock } = require('../../middleware/stock')
const os = require('os')
const { summaryOrder } = require('../../utilities/summary')
const {
  to2,
  updateStockMongo,
  calculateStockSummary
} = require('../../middleware/order')
const { getSocket } = require('../../socket')
const product = require('../../models/cash/product')

exports.addProductToPreTrip = async (req, res) => {
  try {
    const { productId, area, period, qty, unit } = req.body
    const channel = req.headers['x-channel']
    const { User } = getModelsByChannel(channel, res, userModel)
    const { Stock } = getModelsByChannel(channel, res, stockModel)
    const { Product } = getModelsByChannel(channel, res, productModel)

    const productDetail = await Product.findOne({ id: productId, 'listUnit.unit': unit })

    if (!productDetail) {
      return res.status(404).json({
        status: 404,
        message: 'Not found Product'
      })
    }

    // Find product unit factor
    const factorPcsResult = await Product.aggregate([
      { $match: { id: productId } },
      {
        $project: {
          id: 1,
          listUnit: {
            $filter: {
              input: '$listUnit',
              as: 'unitItem',
              cond: { $eq: ['$$unitItem.unit', unit] }
            }
          }
        }
      }
    ])
    const factorCtnResult = await Product.aggregate([
      { $match: { id: productId } },
      {
        $project: {
          id: 1,
          listUnit: {
            $filter: {
              input: '$listUnit',
              as: 'unitItem',
              cond: { $eq: ['$$unitItem.unit', 'CTN'] }
            }
          }
        }
      }
    ])
    // console.log("factorPcsResult",factorPcsResult)
    const factorCtn = factorCtnResult?.[0]?.listUnit?.[0]?.factor || 0
    const factorPcs = factorPcsResult?.[0]?.listUnit?.[0]?.factor || 0

    const factorPcsQty = qty * factorPcs
    const factorCtnQty = factorCtn > 0 ? Math.floor(factorPcsQty / factorCtn) : 0

    const stockData = await Stock.findOne({
      area: area, period: period
    })


    const existStock = stockData.listProduct.find(item => item.productId === productId)

    if (existStock) {
      await Stock.updateOne(
        { area, period },
        {
          $inc: {
            'listProduct.$[elem].stockPcs': factorPcsQty,
            'listProduct.$[elem].balancePcs': factorPcsQty,
            'listProduct.$[elem].stockCtn': factorCtnQty,
            'listProduct.$[elem].balanceCtn': factorCtnQty,
          }
        },
        {
          arrayFilters: [{ 'elem.productId': productId }]
        }
      )
    } else {

      await Stock.updateOne(
        { area, period },
        {
          $push: {
            listProduct: {
              productId: productId,
              stockPcs: factorPcsQty,
              stockInPcs: 0,
              stockOutPcs: 0,
              balancePcs: factorPcsQty,
              stockCtn: factorCtnQty,
              stockInCtn: 0,
              stockOutCtn: 0,
              balanceCtn: factorCtnQty,
            }
          }
        }
      )
    }





    res.status(200).json({
      status: 200,
      message: 'addProductToPreTrip Success',
    })

  } catch (error) {
    console.error('checkStock error:', error)
    return res.status(500).json({
      status: 500,
      message: 'Internal Server Error',
      error: error.message
    })
  }
}