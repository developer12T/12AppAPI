const mongoose = require('mongoose')
const { dbCA } = require('../../config/db')

const listCartRefund = mongoose.Schema({
  id: { type: String, require: true, default: '' },
  lot: { type: String, require: true, default: '' },
  name: { type: String, require: true, default: '' },
  qty: { type: Number, require: true, default: 0 },
  unit: { type: String, require: true, default: '' },
  price: { type: Number, require: true, default: 0 },
  condition: { type: String, require: true },
  expireDate: { type: String, require: true }
})

const listProductPromotion = mongoose.Schema({
  id: { type: String, require: true, default: '' },
  lot: { type: String, default: '' },
  name: { type: String, require: true, default: '' },
  group: { type: String, require: true, default: '' },
  flavour: { type: String, require: true, default: '' },
  brand: { type: String, require: true, default: '' },
  size: { type: String, require: true, default: '' },
  qty: { type: Number, require: true, default: 0 },
  unit: { type: String, require: true, default: '' },
  unitName: { type: String, require: true, default: '' },
  qtyPcs: { type: Number, require: true }
})

const listCartPromotion = mongoose.Schema({
  proId: { type: String, require: true, default: '' },
  proCode: { type: String, require: true, default: '' },
  proName: { type: String, require: true, default: '' },
  proType: { type: String, require: true, default: '' },
  proQty: { type: Number, require: true, default: 0 },
  discount: { type: Number, require: true, default: 0 },
  proConditions: { type: Number, default: 0 } ,
  proAmount: { type: Number,  default: 0 } ,
  listProduct: [listProductPromotion]
})

const listCartProduct = mongoose.Schema({
  id: { type: String, require: true, default: '' },
  // lot: { type: String, default: '' },
  name: { type: String, require: true, default: '' },
  qty: { type: Number, require: true, default: 0 },
  unit: { type: String, require: true, default: '' },
  price: { type: Number, require: true, default: 0 },
  condition: { type: String },
  action: { type: String }
})

const listQuotaSchema = new mongoose.Schema({
  quotaId: { type: String, required: true },
  detail: { type: String, required: true },
  proCode: { type: String, required: true },
  quota: { type: Number },
  listProduct: [
    {
      id: { type: String },
      name: { type: String },
      lot: { type: String },
      groupCode: { type: String },
      group: { type: String },
      brandCode: { type: String },
      brand: { type: String },
      size: { type: String },
      flavourCode: { type: String },
      flavour: { type: String },
      qty: { type: Number },
      unit: { type: String },
      unitName: { type: String },
      qtyPcs: { type: Number }
    }
  ]
})

const cartSchema = mongoose.Schema(
  {
    type: { type: String, require: true },
    area: { type: String, require: true },
    proId: { type: String },
    storeId: { type: String },
    withdrawId: { type: String },
    shippingId: { type: String },
    total: { type: Number, require: true, default: 0 },
    listProduct: [listCartProduct],
    listPromotion: [listCartPromotion],
    totalProCal : { type: Number },
    totalProCalDiff : { type: Number },
    listPromotionSelect: [listCartPromotion],
    listRefund: [listCartRefund],
    listQuota: [listQuotaSchema],
    canSelectPro : {type:Boolean},
    cartHashProduct: { type: String, default: '' },
    cartHashPromotion: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true
  }
)

// const Cart = dbCA.model('Cart', cartSchema)
// module.exports = { Cart }
module.exports = conn => {
  return {
    Cart: conn.model('Cart', cartSchema)
  }
}
