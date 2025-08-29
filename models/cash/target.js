const mongoose = require('mongoose')
const { dbCA } = require('../../config/db')
const { period } = require('../../utilities/datetime')

const targetSchema = new mongoose.Schema({
  TG_AREA: { type: String, require: true },
  TG_ZONE: { type: String, require: true },
  TG_TEAM: { type: String, require: true },
  TG_PERIOD: { type: String, require: true },
  TG_CHANNEL: { type: String, require: true },
  TG_AMOUNT: { type: String, require: true }
})

module.exports = conn => {
  return {
    Target: conn.model('Target', targetSchema)
  }
}
