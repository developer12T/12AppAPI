const mongoose = require('mongoose')
const { Schema } = mongoose;

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

// const listProductSchema = new mongoose.Schema(
//   {
//     productId: { type: String, required: true },
//     sumQtyPcs: { type: Number, required: true },
//     sumQtyCtn: { type: Number, required: true },
//     sumQtyPcsStockIn: { type: Number, required: true , default: 0},
//     sumQtyCtnStockIn: { type: Number, required: true , default: 0},
//     sumQtyPcsStockOut: { type: Number, required: true , default: 0},
//     sumQtyCtnStockOut: { type: Number, required: true , default: 0},

//     available: { type: [availableSchema], default: [] }
//   },
//   { _id: false }
// )

const listProductSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    stockPcs: { type: Number, required: true },
    stockInPcs: { type: Number, required: true, default: 0 },
    stockOutPcs: { type: Number, required: true, default: 0 },
    balancePcs: { type: Number, required: true, default: 0 },
    stockCtn: { type: Number, required: true },
    stockInCtn: { type: Number, required: true, default: 0 },
    stockOutCtn: { type: Number, required: true, default: 0 },
    balanceCtn: { type: Number, required: true, default: 0 },
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
}, {
  timestamps: true
})


const listProductMovementSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    unit: { type: String, default: '' },
    // lot: { type: String, default: '' },
    qty: { type: Number, default: 0 },
    condition: { type: String, default: '' },
    statusMovement: { type: String, default: '' }
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
  statusTH: { type: String, required: true },
  action: { type: String, required: true },
  product: { type: [listProductMovementSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
})

const stockMovementLogSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  refOrderId: { type: Schema.Types.ObjectId, required: true },
  area: { type: String, required: true },
  saleCode: { type: String, required: true },
  period: { type: String, required: true },
  warehouse: { type: String, required: true },
  status: { type: String, required: true },
  statusTH: { type: String, required: true },
  action: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
})

const listincidentStockProductSchema = new mongoose.Schema({
  id: { type: String, require: true },
  name: { type: String, require: true },
  lot: { type: String, require: true },
  groupCode: { type: String, require: true },
  group: { type: String, require: true },
  brandCode: { type: String, require: true },
  brand: { type: String, require: true },
  size: { type: String, require: true },
  flavourCode: { type: String, require: true },
  flavour: { type: String, require: true },
  qty: { type: Number, require: true },
  unit: { type: String, require: true },
  unitName: { type: String, require: true },
  qtyPcs: { type: Number, require: true },
  price: { type: Number, require: true },
  subtotal: { type: Number, require: true },
  discount: { type: Number, require: true, default: 0 },
  netTotal: { type: Number, require: true },
  action: { type: String, },
})



const incidentStockImageSchema = mongoose.Schema({
  name: { type: String },
  path: { type: String },
  type: { type: String },
})



const adjustStockSchema = new mongoose.Schema({
  type: { type: String, require: true, enum: ['adjuststock'] },
  orderId: { type: String, required: true },
  // stockId :{ type: String, required: true },
  area: { type: String, required: true },
  saleCode: { type: String, required: true },
  period: { type: String, required: true },
  status: { type: String, require: true, enum: ['pending', 'completed', 'canceled', 'rejected'], default: 'pending' },
  statusTH: { type: String, require: true, enum: ['รอนำเข้า', 'สำเร็จ', 'ยกเลิก', 'ถูกปฏิเสธ'], default: 'รอนำเข้า' },
  note: { type: String, default: '' },
  listImage: [incidentStockImageSchema],
  listProduct: [listincidentStockProductSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
})





module.exports = (conn) => {
  return {
    // Stock: conn.model('Stock', stockSchema),
    Stock: conn.model('stockTest', stockSchema, 'stockTest'),
    StockMovementLog: conn.model('stockMovementLog', stockMovementLogSchema, 'stockmovementlogs'),
    StockMovement: conn.model('StockMovement', stockMovementSchema),
    AdjustStock: conn.model('adjuststocks', adjustStockSchema, 'adjuststocks')
  };
};


