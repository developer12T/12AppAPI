const mongoose = require('mongoose')
const { dbCA } = require('../../config/db')

const orderSaleSchema = new mongoose.Schema({
    saleCode: { type: String, require: true },
    salePayer: { type: String, require: true },
    name: { type: String, require: true },
    tel: { type: String, require: true },
    warehouse: { type: String, require: true },
})

const orderStoreSchema = new mongoose.Schema({
    storeId: { type: String, require: true },
    name: { type: String, require: true },
    type: { type: String },
    address: { type: String, require: true },
    taxId: { type: String, require: true },
    tel: { type: String, require: true },
    area: { type: String, require: true },
    zone: { type: String, require: true },
})

const listOrderProductSchema = new mongoose.Schema({
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
    netTotal: { type: Number, require: true }
})


const listOrderPromotionSchema = new mongoose.Schema({
    proId: { type: String, require: true },
    proCode: { type: String, require: true },
    proName: { type: String, require: true },
    proType: { type: String, require: true },
    proQty: { type: Number, require: true, default: 0 },
    discount: { type: Number, require: true, default: 0 },
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



const orderShipingSchema = new mongoose.Schema({
    shippingId: { type: String, require: true },
    address: { type: String, require: true }
})

const orderImageSchema = mongoose.Schema({
    name: { type: String },
    path: { type: String },
    type: { type: String },
})

const orderSchema = new mongoose.Schema({
    type: { type: String, require: true, enum: ['sale', 'change', 'withdraw'] },
    orderId: { type: String, require: true, unique: true },
    sale: orderSaleSchema,
    store: orderStoreSchema,
    shipping: orderShipingSchema,
    note: { type: String, require: true },
    latitude: { type: String, require: true },
    longitude: { type: String, require: true },
    status: { type: String, require: true, enum: ['pending', 'completed', 'canceled', 'rejected'], default: 'pending' },
    listProduct: [listOrderProductSchema],
    listPromotions: [listOrderPromotionSchema],
    listQuota: [listQuotaSchema],
    subtotal: { type: Number, require: true },
    discount: { type: Number, default: 0 },
    discountProductId: [
        {
            proShelfId: { type: String, required: true }
        }
    ],
    discountProduct: { type: Number, default: 0 },
    vat: { type: Number, default: 0 },
    totalExVat: { type: Number, default: 0 },
    total: { type: Number, require: true },
    paymentMethod: { type: String, default: 'cash' },
    paymentStatus: { type: String, default: 'unpaid' },
    listImage: [orderImageSchema],
    reference: { type: String, require: true, default: '' },
    createdBy: { type: String, require: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
})

// const Order = dbCA.model('Order', orderSchema)
// module.exports = { Order }

module.exports = (conn) => {
    return {
        Order: conn.model('Order', orderSchema),
    };
};