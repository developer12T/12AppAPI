const mongoose = require('mongoose')
const { dbCA } = require('../../config/db')

const refundSaleSchema = new mongoose.Schema({
    saleCode: { type: String, require: true },
    salePayer: { type: String, require: true },
    name: { type: String, require: true },
    tel: { type: String, require: true },
    warehouse: { type: String, require: true },
})

const refundStoreSchema = new mongoose.Schema({
    storeId: { type: String, require: true },
    name: { type: String, require: true },
    type: { type: String },
    address: { type: String, require: true },
    taxId: { type: String, require: true },
    tel: { type: String, require: true },
    area: { type: String, require: true },
    zone: { type: String, require: true },
})

const listRefundProductSchema = new mongoose.Schema({
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
    total: { type: Number, require: true },
    condition: { type: String, require: true },
    expireDate: { type: String, require: true, default: '' },
    lot: { type: String, require: true, default: '' }
})

const refundImageSchema = mongoose.Schema({
    name: { type: String },
    path: { type: String },
    type: { type: String },
})

const refundSchema = new mongoose.Schema({
    type: { type: String, require: true, enum: ['refund'] },
    orderId: { type: String, require: true, unique: true },
    sale: refundSaleSchema,
    store: refundStoreSchema,
    note: { type: String, require: true },
    latitude: { type: String, require: true },
    longitude: { type: String, require: true },
    status: { type: String, require: true, enum: ['pending', 'completed', 'canceled', 'rejected'], default: 'pending' },
    statusTH: { type: String, require: true, enum: ['รอนำเข้า', 'สำเร็จ', 'ยกเลิก', 'ถูกปฏิเสธ'], default: 'รอนำเข้า' },
    listProduct: [listRefundProductSchema],
    vat: { type: Number, default: 0 },
    totalExVat: { type: Number, default: 0 },
    total: { type: Number, require: true },
    listImage: [refundImageSchema],
    reference: { type: String },
    createdBy: { type: String, require: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    period: { type: String, require: true }
})

// const Refund = dbCA.model('Refund', refundSchema)
// module.exports = { Refund }


module.exports = (conn) => {
    return {
        Refund: conn.model('Refund', refundSchema),
    };
};