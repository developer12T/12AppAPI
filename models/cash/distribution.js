const mongoose = require('mongoose')
const { dbCA } = require('../../config/db')

const listWarehouse = mongoose.Schema({
    normal: { type: String, require: true },
    clearance: { type: String, require: true },
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

const receiveSchema = mongoose.Schema({
    type: { type: String, require: true, default: 'receive'},
    orderId: { type: String, require: true },
    orderType: { type: String, require: true },
    orderTypeName: { type: String, require: true },
    area: { type: String, require: true },
    saleCode: { type: String, reuire: true },
    fromWarehouse: { type: String, require: true },
    toWarehouse: { type: String, require: true },
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
    status: { type: String, require: true, enum: ['pending', 'completed', 'canceled', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
})

const listProductDistribution = new mongoose.Schema({
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
    weightNet: { type: Number, require: true }
})

const distributionSchema = mongoose.Schema({
    type: { type: String, require: true, default: 'withdraw'},
    orderId: { type: String, require: true },
    orderType: { type: String, require: true }, //T04, T05
    orderTypeName: { type: String, require: true }, //รับเอง, ส่งสินค้า
    area: { type: String, require: true },
    saleCode: { type: String, require: true },
    fromWarehouse: { type: String, require: true },
    toWarehouse: { type: String, require: true },
    shippingId: { type: String, require: true }, //ex NS212-1
    shippingRoute: { type: String, require: true }, //ex NS212
    shippingName: { type: String, require: true }, // โรงแรมรำพึง
    sendAddress: { type: String, require: true }, //รีสอร์ต อ.บึงสามพัน
    sendDate: { type: String, require: true },
    remark: { type: String, require: true },
    listProduct: [listProductDistribution],
    total: { type: Number, require: true, default: 0 },
    totalQty: { type: Number, require: true, default: 0 },
    totalWeightGross: { type: Number, require: true, default: 0 },
    totalWeightNet: { type: Number, require: true, default: 0 },
    status: { type: String, require: true, enum: ['pending', 'completed', 'canceled', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
})

const Place = dbCA.model('Place', placeSchema)
const Distribution = dbCA.model('Distribution', distributionSchema)
const Receive = dbCA.model('Receive', receiveSchema)
module.exports = { Place, Distribution, Receive }