const mongoose = require('mongoose')

const imageSchema = mongoose.Schema({
  name: { type: String },
  path: { type: String },
  type: { type: String }
})

const userSchema = mongoose.Schema({
  id: { type: String, require: true },
  username: { type: String, require: true },
  password: { type: String, require: true },
  saleCode: { type: String, require: true },
  salePayer: { type: String, require: true },
  firstName: { type: String, require: true },
  surName: { type: String, require: true },
  tel: { type: String, require: true },
  zone: { type: String, require: true },
  area: { type: String, require: true },
  warehouse: { type: String, require: true },
  role: { type: String, require: true },
  status: { type: String, require: true },
  qrCodeImage: { type: String, require: true },
  period: { type: String, require: true },
  image: { imageSchema },
  typeTruck: { type: String , default: '6W' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
})

// const User = dbCA.model('User', userSchema)
// module.exports = { User }

module.exports = conn => {
  return {
    User: conn.model('User', userSchema)
  }
}
