const mongoose = require('mongoose')
const { dbCA } = require('../../config/db')

const price = mongoose.Schema({
    sale: { type: Number },
    refund: { type: Number },
})

const listUnit = mongoose.Schema({
    unit: { type: String },
    name: { type: String },
    factor: { type: String },
    price: price,
})

const productSchema = mongoose.Schema({
    id: { type: String, require: true },
    name: { type: String, require: true },
    group: { type: String, require: true },
    brand: { type: String, require: true },
    size: { type: String, require: true },
    flavour: { type: String, require: true },
    type: { type: String, require: true },
    weightGross: { type: String, require: true },
    weightNet: { type: String, require: true },
    statusSale: { type: String, require: true },
    statusWithdraw: { type: String, require: true },
    statusRefund: { type: String, require: true },
    image: { type: String, default: '' },
    listUnit: [listUnit],
    created: { type: Date, default: Date.now },
    updated: { type: Date, default: Date.now },
})

const Product = dbCA.model('Product', productSchema)
module.exports = { Product }