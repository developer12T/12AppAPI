const mongoose = require('mongoose')
const { dbCA } = require('../../config/db')

const availableSchema = new mongoose.Schema({
    qtyPcs: { type: Number, default: 0 },
    lot: { type: String, default: '' }
}, { _id: false })

const listProductSchema = new mongoose.Schema({
    productId: { type: String, required: true },
    productName: { type: String, required: true },
    productGroup: { type: String, default: '' },
    productFlavour: { type: String, default: '' },
    productSize: { type: String, default: '' },
    available: { type: [availableSchema], default: [] }
}, { _id: false })

const stockSchema = new mongoose.Schema({
    area: { type: String, required: true },
    saleCode: { type: String, required: true },
    period: { type: String, require: true },
    listProduct: { type: [listProductSchema], default: [] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
})

const Stock = dbCA.model('Stock', stockSchema)
module.exports = { Stock }