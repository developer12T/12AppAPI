const mongoose = require('mongoose')

const imageSchema = mongoose.Schema({
  name: { type: String },
  path: { type: String },
  createAt: { type: Date, default: Date.now }
})

const sendMoneySchema = mongoose.Schema({
  area: { type: String, require: true },
  preiod: { type: String, require: true },
  sendmoney: { type: Number, require: true },
  different: { type: Number, require: true },
  imageList: [imageSchema],
  status: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  dateAt: { type: Date },
  salePayer: { type: String, require: true },
  saleCode: { type: String, require: true },
}, {
  timestamps: true
})

module.exports = conn => {
  return {
    SendMoney: conn.model('sendmoney', sendMoneySchema, 'sendmoney')
  }
}
