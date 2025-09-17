const mongoose = require('mongoose')
const { dbCA } = require('../../config/db')

const optionSchema = mongoose.Schema(
  {
    radius: { type: Number, require: true },
    period: { type: String, require: true },
    description: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true
  }
)

module.exports = conn => {
  return {
    Radius: conn.model('Radius', optionSchema)
  }
}
