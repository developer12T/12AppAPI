const mongoose = require('mongoose')
const { dbCA } = require('../../config/db')

const listCartRefund = mongoose.Schema({
    id: { type: String, require: true, default: '' },
    name: { type: String, require: true, default: '' },
    qty: { type: Number, require: true, default: 0 },
    unit: { type: String, require: true, default: '' },
    price: { type: Number, require: true, default: 0 },
    condition: { type: String, require: true },
    expireDate: { type: String, require: true }
})

const listProductPromotion = mongoose.Schema({
    id: { type: String, require: true, default: '' },
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
    proName: { type: String, require: true, default: '' },
    proType: { type: String, require: true, default: '' },
    proQty: { type: Number, require: true, default: 0 },
    discount: { type: Number, require: true, default: 0 },
    listProduct: [listProductPromotion]
})

const listCartProduct = mongoose.Schema({
    id: { type: String, require: true, default: '' },
    name: { type: String, require: true, default: '' },
    qty: { type: Number, require: true, default: 0 },
    unit: { type: String, require: true, default: '' },
    price: { type: Number, require: true, default: 0 }
})

const cartSchema = mongoose.Schema({
    type: { type: String, require: true },
    area: { type: String, require: true },
    storeId: { type: String },
    shippingId: { type: String },
    total: { type: Number, require: true, default: 0 },
    listProduct: [listCartProduct],
    listPromotion: [listCartPromotion],
    listRefund: [listCartRefund],
    cartHashProduct: { type: String, default: '' },
    cartHashPromotion: { type: String, default: '' },
    createdAt: { type: Date },
    updatedAt: { type: Date, default: Date.now },
})

const Cart = dbCA.model('Cart', cartSchema)
module.exports = { Cart }