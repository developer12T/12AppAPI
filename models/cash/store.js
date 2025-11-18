const mongoose = require('mongoose')
const { dbCA } = require('../../config/db')
const { create } = require('lodash')

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
    provinceCode: { type: String },
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
    storeIdOld : { type: String } ,
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
    areaOld: { type: String  },
    latitude: { type: String, require: true },
    longtitude: { type: String, require: true },
    lineId: { type: String },
    note: { type: String },
    status: { type: String ,default: '10'},
    approve: approveSchema,
    policyConsent: policyConsentSchema,
    imageList: [imageSchema],
    shippingAddress: [shippingSchema],
    checkIn: checkinSchema,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    date: {
        type: Date,
        default: () => {
          const now = new Date();
          // เพิ่ม 7 ชั่วโมง (GMT+7)
          return new Date(now.getTime() + 7 * 60 * 60 * 1000);
        }
      }
}, {
  timestamps: true
})

const typeStoreSchema = mongoose.Schema({
    id: { type: String, require: true },
    name: { type: String, require: true },
    status: { type: String, default:'1' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
}, {
  timestamps: true
})

// const Store = dbCA.model('Store', storeSchema)
// const TypeStore = dbCA.model('TypeStore', typeStoreSchema)
// module.exports = { Store, TypeStore }

const runningNumberSchema = mongoose.Schema({
    zone: { type: String, require: true },
    type: { type: String, require: true },
    name: { type: String, require: true },
    start: { type: String, require: true },
    last: { type: String, require: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
}, {
  timestamps: true
})

const storeBeautySchema = new mongoose.Schema({
    storeId: { type: String, required: true },
    area: { type: String, required: true },
    type: { type: [String], required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    usedPro: { type: [String] }
}, {
  timestamps: true
});



module.exports = (conn) => {
    return {
      Store: conn.model('Store', storeSchema),
      StoreType: conn.model('storetypes', typeStoreSchema,'storetypes'),
      RunningNumber: conn.model('runningnumber',runningNumberSchema,'runningnumber'),
      TypeStore: conn.model('typestores',storeBeautySchema,'typestores')

    };
  };