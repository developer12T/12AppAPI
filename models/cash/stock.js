const mongoose = require('mongoose')
const { dbCA } = require('../../config/db') // ตรวจสอบการเชื่อมต่อ

const availableSchema = new mongoose.Schema(
  {
    location: { type: String, default: '' },
    lot: { type: String, default: '' },
    qtyPcs: { type: Number, default: 0 },
    qtyCtn: { type: Number, default: 0 }
  },
  { _id: false }
)

const listProductSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    sumQtyPcs: { type: Number, required: true },
    sumQtyCtn: { type: Number, required: true },
    available: { type: [availableSchema], default: [] }
  },
  { _id: false }
)

const stockSchema = new mongoose.Schema({
  area: { type: String, required: true },
  saleCode: { type: String, required: true },
  period: { type: String, required: true },
  warehouse: { type: String, required: true },
  listProduct: { type: [listProductSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})


const listProductMovementSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    unit: { type: String, default: '' },
    lot: { type: String, default: '' },
    qty: { type: Number, default: 0 }
  },
  { _id: false }
)

const stockMovementSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  area: { type: String, required: true },
  saleCode: { type: String, required: true },
  period: { type: String, required: true },
  warehouse: { type: String, required: true },
  status: { type: String, required: true },
  action: { type: String, required: true },
  product: { type: [listProductMovementSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

const Stock = dbCA.model('Stock', stockSchema)
const StockMovement = dbCA.model('StockMovement', stockMovementSchema)
module.exports = { Stock, StockMovement }

// const availableSchema = new mongoose.Schema({
//     qtyPcs: { type: Number, default: 0 },
//     lot: { type: String, default: '' }
// }, { _id: false })

// const listProductSchema = new mongoose.Schema({
//     productId: { type: String, required: true },
//     productName: { type: String, required: true },
//     productGroup: { type: String, default: '' },
//     productFlavour: { type: String, default: '' },
//     productSize: { type: String, default: '' },
//     available: { type: [availableSchema], default: [] }
// }, { _id: false })

// const stockSchema = new mongoose.Schema({
//     area: { type: String, required: true },
//     saleCode: { type: String, required: true },
//     period: { type: String, require: true },
//     listProduct: { type: [listProductSchema], default: [] },
//     createdAt: { type: Date, default: Date.now },
//     updatedAt: { type: Date, default: Date.now }
// })

// const Stock = dbCA.model('Stock', stockSchema)
// module.exports = { Stock }
