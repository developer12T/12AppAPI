const mongoose = require('mongoose')

const imageSchema = mongoose.Schema({
  name: { type: String },
  path: { type: String },
  createAt: { type: Date, default: Date.now }
})

const sendMoneySchema = mongoose.Schema({
  area: { type: String, require: true },
  date: { type: Date, require: true },
  sendmoney: { type: Number, require: true },
  imageList: [imageSchema],
  status: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

module.exports = conn => {
  return {
    SendMoney: conn.model('sendMoney', sendMoneySchema, 'sendMoney')
  }
}
