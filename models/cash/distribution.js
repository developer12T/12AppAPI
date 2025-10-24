const mongoose = require('mongoose')
const { dbCA } = require('../../config/db')
const { sequelize, DataTypes } = require('../../config/m3db')
const { timestamp } = require('../../utilities/datetime')

const listWarehouse = mongoose.Schema({
  normal: { type: String, require: false },
  clearance: { type: String, require: false }
})

const remarkWarehouse = mongoose.Schema({
  remark: { type: String, require: false },
  user: { type: String, require: false },
  dateAction: { type: Date, default: Date.now }
})

const listAddress = mongoose.Schema({
  type: { type: String, require: true },
  typeNameTH: { type: String, require: true },
  typeNameEN: { type: String, require: true },
  shippingId: { type: String, require: true },
  route: { type: String, require: true },
  name: { type: String, require: true },
  address: { type: String, require: true },
  district: { type: String, require: true },
  subDistrict: { type: String, require: true },
  province: { type: String, require: true },
  postcode: { type: String, require: true },
  tel: { type: String, require: true },
  warehouse: listWarehouse
})

const placeSchema = mongoose.Schema({
  area: { type: String, require: true },
  listAddress: [listAddress]
})

const listProductReceive = new mongoose.Schema({
  id: { type: String, require: true },
  name: { type: String, require: true },
  group: { type: String, require: true },
  brand: { type: String, require: true },
  size: { type: String, require: true },
  flavour: { type: String, require: true },
  qty: { type: Number, require: true },
  unit: { type: String, require: true },
  qtyPcs: { type: Number, require: true },
  price: { type: Number, require: true },
  total: { type: Number, require: true },
  weightGross: { type: Number, require: true },
  weightNet: { type: Number, require: true },
  lot: { type: String, require: true, default: 0 }
})

const receiveSchema = mongoose.Schema(
  {
    type: { type: String, require: true, default: 'receive' },
    orderId: { type: String, require: true },
    orderType: { type: String, require: true },
    orderTypeName: { type: String, require: true },
    area: { type: String, require: true },
    saleCode: { type: String, reuire: true },
    fromWarehouse: { type: String, require: false },
    toWarehouse: { type: String, require: false },
    shippingId: { type: String, require: true },
    shippingRoute: { type: String, require: true },
    shippingName: { type: String, require: true },
    sendAddress: { type: String, require: true },
    sendDate: { type: String, require: true },
    remark: { type: String, require: true },
    listProduct: [listProductReceive],
    total: { type: Number, require: true, default: 0 },
    totalQty: { type: Number, require: true, default: 0 },
    totalWeightGross: { type: Number, require: true, default: 0 },
    totalWeightNet: { type: Number, require: true, default: 0 },
    status: {
      type: String,
      require: true,
      enum: ['pending', 'completed', 'canceled', 'rejected'],
      default: 'pending'
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true
  }
)

const listProductDistribution = new mongoose.Schema({
  id: { type: String, require: true },
  lot: { type: String, require: true },
  name: { type: String, require: true },
  group: { type: String, require: true },
  brand: { type: String, require: true },
  size: { type: String, require: true },
  flavour: { type: String, require: true },
  qty: { type: Number, require: true },
  unit: { type: String, require: true },
  qtyPcs: { type: Number, require: true },
  price: { type: Number, require: true },
  total: { type: Number, require: true },
  weightGross: { type: Number, require: true },
  weightNet: { type: Number, require: true },
  receiveUnit: { type: String, default: '' },
  receiveQty: { type: Number, require: true, default: 0 },
  isNPD: { type: Boolean, default: false }
})

const distributionSchema = mongoose.Schema(
  {
    type: { type: String, require: true, default: 'withdraw' },
    orderId: { type: String, require: true },
    orderType: { type: String, require: true }, //T04, T05
    orderTypeName: { type: String, require: true }, //รับเอง, ส่งสินค้า
    withdrawType: { type: String, require: true },
    area: { type: String, require: true },
    saleCode: { type: String, require: true },
    fromWarehouse: { type: String, require: false },
    toWarehouse: { type: String, require: false },
    shippingId: { type: String, require: true }, //ex NS212-1
    shippingRoute: { type: String, require: true }, //ex NS212
    shippingName: { type: String, require: true }, // โรงแรมรำพึง
    sendAddress: { type: String, require: true }, //รีสอร์ต อ.บึงสามพัน
    sendDate: { type: String, require: true },
    remark: { type: String, require: true },
    remarkWarehouse: remarkWarehouse,
    listProduct: [listProductDistribution],
    total: { type: Number, require: true, default: 0 },
    totalQty: { type: Number, require: true, default: 0 },
    totalWeightGross: { type: Number, require: true, default: 0 },
    totalWeightNet: { type: Number, require: true, default: 0 },
    receivetotal: { type: Number, require: true, default: 0 },
    receivetotalQty: { type: Number, require: true, default: 0 },
    receivetotalWeightGross: { type: Number, require: true, default: 0 },
    receivetotalWeightNet: { type: Number, require: true, default: 0 },
    status: {
      type: String,
      require: true,
      enum: ['pending', 'completed', 'canceled', 'rejected'],
      default: 'pending'
    },
    statusTH: {
      type: String,
      require: true,
      enum: ['รอนำเข้า', 'สำเร็จ', 'ยกเลิก', 'ถูกปฏิเสธ'],
      default: 'รอนำเข้า'
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    period: { type: String, require: true },
    newTrip: { type: String },
    lineM3: { type: String },
    lowStatus: { type: String },
    heightStatus: { type: String },
    approve: [
      {
        dateSend: { type: Date, default: Date.now },
        dateAction: { type: Date, default: Date.now },
        role: { type: String },
        appPerson: { type: String },
        status: { type: String }
      }
    ]
  },
  {
    timestamps: true
  }
)

const withdrawSchema = mongoose.Schema({
  Des_No: { type: String, required: true },
  Des_Name: { type: String, required: true },
  Des_Date: { type: String, required: true },
  Des_Area: { type: String, required: true },
  ZType: { type: String, required: true },
  WH: { type: String, required: true },
  ROUTE: { type: String, required: true },
  WH1: { type: String, required: true },
  Dc_Email: { type: String }
})

const wereHouseSchema = mongoose.Schema({
  wh_code: { type: String, required: true },
  wh_name: { type: String, required: true }
})

// const Withdraw = dbCA.model('Withdraw', withdrawSchema, 'withdraw');
// const Place = dbCA.model('Place', placeSchema)
// const Distribution = dbCA.model('Distribution', distributionSchema)
// const Receive = dbCA.model('Receive', receiveSchema)

// module.exports = { Place, Distribution, Receive ,Withdraw }

module.exports = conn => {
  return {
    Withdraw: conn.model('Withdraw', withdrawSchema, 'withdraw'),
    Place: conn.model('Place', placeSchema),
    Distribution: conn.model('Distribution', distributionSchema),
    Receive: conn.model('Receive', receiveSchema),
    WereHouse: conn.model('wereHouse', wereHouseSchema)
  }
}
