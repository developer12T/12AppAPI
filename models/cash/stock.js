const mongoose = require('mongoose')
const { dbCA } = require('../../config/db') // ตรวจสอบการเชื่อมต่อ

const availableSchema = new mongoose.Schema(
  {
    location: { type: String, default: '' },
    lot: { type: String, default: '' },
    qtyPcs: { type: Number, required: true },
    qtyPcsStockIn: { type: Number, default: 0 },
    qtyPcsStockOut: { type: Number, default: 0 },
    qtyCtn: { type: Number, default: 0 },
    qtyCtnStockIn: { type: Number, default: 0 },
    qtyCtnStockOut: { type: Number, default: 0 },
  },
  { _id: false }
)

const listProductSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    sumQtyPcs: { type: Number, required: true },
    sumQtyCtn: { type: Number, required: true },
    sumQtyPcsStockIn: { type: Number, required: true , default: 0},
    sumQtyCtnStockIn: { type: Number, required: true , default: 0},
    sumQtyPcsStockOut: { type: Number, required: true , default: 0},
    sumQtyCtnStockOut: { type: Number, required: true , default: 0},

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
    productId: { type: String, required: true },
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

const stockMovementLogSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  area: { type: String, required: true },
  saleCode: { type: String, required: true },
  period: { type: String, required: true },
  warehouse: { type: String, required: true },
  status: { type: String, required: true },
  action: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

module.exports = (conn) => {
  return {
    Stock: conn.model('Stock', stockSchema),
    StockMovementLog: conn.model('stockMovementLog', stockMovementLogSchema,'stockmovementlogs'),
    StockMovement: conn.model('StockMovement', stockMovementSchema)
  };
};


