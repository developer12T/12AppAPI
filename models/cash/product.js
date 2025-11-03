const mongoose = require('mongoose')
const { dbCA } = require('../../config/db')

const price = mongoose.Schema({
    sale: { type: Number ,default: 0},
    refund: { type: Number ,default: 0},
    refundDmg: { type: Number ,default: 0},
    change: { type: Number ,default: 0},
})

const listUnit = mongoose.Schema({
    unit: { type: String },
    name: { type: String },
    factor: { type: Number },
    price: price,
})
/////

const productSchema = mongoose.Schema({
    id: { type: String, require: true },
    name: { type: String, require: true },
    nameBill:{ type: String },
    groupCode: { type: String, require: true },
    group: { type: String, require: true },
    groupCodeM3: { type: String, require: true },
    groupM3: { type: String, require: true },
    brandCode: { type: String, require: true },
    brand: { type: String, require: true },
    size: { type: String, require: true },
    flavourCode: { type: String, require: true },
    flavour: { type: String, require: true },
    type: { type: String, require: true },
    weightGross: { type: Number, require: true, default: 0 },
    weightNet: { type: Number, require: true, default: 0 },
    statusSale: { type: String, require: true },
    statusWithdraw: { type: String, require: true },
    statusRefund: { type: String, require: true },
    statusRefundDmg: { type: String, require: true },
    image: { type: String, default: '' },
    listUnit: [listUnit],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
})

// const Product = dbCA.model('Product', productSchema)
// module.exports = { Product }

module.exports = (conn) => {
    return {
        Product: conn.model('Product', productSchema),
    };
};