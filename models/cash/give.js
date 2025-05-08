const mongoose = require('mongoose')
const { dbCA } = require('../../config/db')

const giveawaysProduct = new mongoose.Schema({
    productId: [{ type: String }],
    productGroup: [{ type: String }],
    productFlavour: [{ type: String }],
    productBrand: [{ type: String }],
    productSize: [{ type: String }],
    productUnit: [{ type: String }],
    productQty: { type: Number, default: 0 },
    productAmount: { type: Number, default: 0 },
    limitType: { type: String, enum: ['limited', 'unlimited'], default: 'limited' }
})

const giveTypeSchema = new mongoose.Schema({
    giveId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String },
    type: { type: String, required: true },
    remark: { type: String, required: true },
    dept: { type: String, required: true },
    applicableTo: {
        store: [{ type: String }],
        typeStore: [{ type: String }],
        zone: [{ type: String }],
        area: [{ type: String }],
    },
    conditions: [giveawaysProduct],
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdAt: { type: Date },
    updatedAt: { type: Date, default: Date.now }
})

const giveInfoSchema = new mongoose.Schema({
    name: { type: String, require: true },
    type: { type: String, require: true },
    remark: { type: String, require: true },
    dept: { type: String, require: true },
})

const giveSaleSchema = new mongoose.Schema({
    saleCode: { type: String, require: true },
    salePayer: { type: String, require: true },
    name: { type: String, require: true },
    tel: { type: String, require: true },
    warehouse: { type: String, require: true },
})

const giveStoreSchema = new mongoose.Schema({
    storeId: { type: String, require: true },
    name: { type: String, require: true },
    type: { type: String },
    address: { type: String, require: true },
    taxId: { type: String, require: true },
    tel: { type: String, require: true },
    area: { type: String, require: true },
    zone: { type: String, require: true },
})

const giveShipingSchema = new mongoose.Schema({
    shippingId: { type: String, require: true },
    address: { type: String, require: true }
})

const listGiveProductSchema = new mongoose.Schema({
    id: { type: String, require: true },
    name: { type: String, require: true },
    group: { type: String, require: true },
    brand: { type: String, require: true },
    size: { type: String, require: true },
    flavour: { type: String, require: true },
    qty: { type: Number, require: true },
    unit: { type: String, require: true },
    unitName: { type: String, require: true },
    qtyPcs: { type: Number, require: true },
    price: { type: Number, require: true },
    total: { type: Number, require: true }
})

const giveImageSchema = mongoose.Schema({
    name: { type: String },
    path: { type: String },
    type: { type: String },
})

const giveawaysSchema = new mongoose.Schema({
    type: { type: String, require: true },
    orderId: { type: String, require: true, unique: true },
    giveInfo: giveInfoSchema,
    sale: giveSaleSchema,
    store: giveStoreSchema,
    shipping: giveShipingSchema,
    note: { type: String, require: true },
    latitude: { type: String, require: true },
    longitude: { type: String, require: true },
    status: { type: String, require: true, enum: ['pending', 'completed', 'canceled', 'rejected'], default: 'pending' },
    listProduct: [listGiveProductSchema],
    totalVat: { type: Number, default: 0 },
    totalExVat: { type: Number, default: 0 },
    total: { type: Number, require: true },
    listImage: [giveImageSchema],
    createdBy: { type: String, require: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
})

// const Giveaway = dbCA.model('Giveaway', giveawaysSchema)
// const Givetype = dbCA.model('Givetype', giveTypeSchema)
// module.exports = { Giveaway, Givetype }

module.exports = (conn) => {
    return {
      Giveaway: conn.model('Giveaway', giveawaysSchema),
      Givetype: conn.model('Givetype', giveTypeSchema),
    };
  };