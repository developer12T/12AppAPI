const mongoose = require('mongoose')

const imageSchema = mongoose.Schema({
  name: { type: String },
  path: { type: String },
  type: { type: String },
})

const approveSchema = mongoose.Schema({
  dateSend: { type: Date, default: Date.now },
  dateAction: { type: Date, default: Date.now },
  appPerson: { type: String, require: true },
})

const storeLatLongSchema = new mongoose.Schema({
  orderId: { type: String, require: true, unique: true },
  storeId: { type: String, require: true, },
  name: { type: String, require: true, },
  area: { type: String, require: true, },
  zone: { type: String, require: true, },
  latitude: { type: String, require: true },
  longtitude: { type: String, require: true },
  imageList: [imageSchema],
  approve: approveSchema,
  status: { type: String, require: true, enum: ['pending', 'completed', 'canceled', 'rejected'], default: 'pending' },
  statusTH: { type: String, require: true, enum: ['รอนำเข้า', 'สำเร็จ', 'ยกเลิก', 'ถูกปฏิเสธ'], default: 'รอนำเข้า' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

module.exports = (conn) => {
  return {
    StoreLatLong: conn.model('storeLatLongs', storeLatLongSchema, 'storeLatLongs'),
  };
};