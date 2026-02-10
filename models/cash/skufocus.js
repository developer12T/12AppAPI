const mongoose = require('mongoose')

const productSchema = mongoose.Schema(
  {
    id: { type: String, require: true },
    name: { type: String, require: true },
    nameBill: { type: String },
    groupCode: { type: String, require: true },
    group: { type: String, require: true },
    groupCodeM3: { type: String, require: true },
    groupM3: { type: String, require: true },
    brandCode: { type: String, require: true },
    brand: { type: String, require: true },
    size: { type: String, require: true },
    sizeNumber: { type: Number, default: 0 },
    flavourCode: { type: String, require: true },
    flavour: { type: String, require: true },
    type: { type: String, require: true },
    weightGross: { type: Number, require: true, default: 0 },
    weightNet: { type: Number, require: true, default: 0 },
    target: { type: Number, require: true, default: 0 },
    statusSale: { type: String, require: true },
    statusWithdraw: { type: String, require: true },
    statusRefund: { type: String, require: true },
    statusRefundDmg: { type: String, require: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true
  }
)

const skufocusSchema = mongoose.Schema(
  {
    area: { type: String, require: true },
    period: { type: String, require: true },
    target: { type: Number, require: true },
    listProduct: [productSchema],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true
  }
)

module.exports = conn => {
  return {
    SkuFocus: conn.model('SkuFocus', skufocusSchema)
  }
}
