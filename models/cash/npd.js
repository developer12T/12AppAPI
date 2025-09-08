const mongoose = require('mongoose')

const npdSchema = mongoose.Schema({
  period: { type: String },
  qty: { type: Number, require: true },
  unit: { type: String },
  areaGet: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})



module.exports = conn => {
  return {
    Npd: conn.model('npd', npdSchema,'npd')
  }
}
