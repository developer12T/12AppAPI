const mongoose = require('mongoose')
const { dbCA } = require('../../config/db')

const approveSchema = mongoose.Schema({
    dateSend: { type: Date, default: Date.now },
    dateAction: { type: Date, default: Date.now },
    appPerson: { type: String, require: true },
})

const policyConsentSchema = mongoose.Schema({
    status: { type: String, require: true },
    date: { type: Date, default: Date.now },
})

const imageSchema = mongoose.Schema({
    name: { type: String },
    path: { type: String },
    type: { type: String },
})

const shippingSchema = mongoose.Schema({
    default: { type: String },
    shippingId: { type: String },
    address: { type: String },
    district: { type: String },
    subDistrict: { type: String },
    province: { type: String },
    postCode: { type: String },
    latitude: { type: String },
    longtitude: { type: String },
})

const checkinSchema = mongoose.Schema({
    latitude: { type: String, default: '0.00' },
    longtitude: { type: String, default: '0.00' },
    updateDate: { type: Date, default: Date.now },
})

const storeSchema = mongoose.Schema({
    storeId: { type: String, require: true, unique: true },
    name: { type: String, require: true },
    taxId: { type: String },
    tel: { type: String, require: true },
    route: { type: String, require: true },
    type: { type: String, require: true },
    typeName: { type: String, require: true },
    address: { type: String, require: true },
    subDistrict: { type: String, require: true },
    district: { type: String, require: true },
    province: { type: String, require: true },
    provinceCode: { type: String, require: true },
    postCode: { type: String, require: true },
    zone: { type: String, require: true },
    area: { type: String, require: true },
    latitude: { type: String, require: true },
    longtitude: { type: String, require: true },
    lineId: { type: String },
    note: { type: String },
    status: { type: String },
    approve: approveSchema,
    policyConsent: policyConsentSchema,
    imageList: [imageSchema],
    shippingAddress: [shippingSchema],
    checkIn: checkinSchema,
    createdDate: { type: Date, default: Date.now },
    updateDate: { type: Date, default: Date.now },
})

const typeStoreSchema = mongoose.Schema({
    id: { type: String, require: true },
    name: { type: String, require: true },
    description: { type: String, require: true },
    status: { type: String, require: true },
    createDate: { type: Date, default: Date.now },
    updateDate: { type: Date, default: Date.now },
})

const Store = dbCA.model('Store', storeSchema)
const TypeStore = dbCA.model('TypeStore', typeStoreSchema)
module.exports = { Store, TypeStore }
