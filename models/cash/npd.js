const mongoose = require('mongoose')
const { period } = require('../../utilities/datetime')
const npdSchema = new mongoose.Schema({
  area: { type: String, required: true },
  period: { type: String, required: true },
  npd: [
    {
      productId: { type: String, required: true },
      qty: { type: Number, required: true },
      unit: { type: String, default: 'CTN' }
    }
  ],
  isReceived: { type: String, default: 'false' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

module.exports = conn => {
  return {
    Npd: conn.model('npd', npdSchema, 'npd')
  }
}
