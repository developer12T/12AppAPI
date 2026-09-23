const mongoose = require('mongoose')

const targetPigeonSchema = new mongoose.Schema({
  ch: { type: String, required: true },
  zone: { type: String, required: true },
  area: { type: String, required: true },
  grp_target: { type: String, required: true },
  list_item: [{
    item_code: { type: String, required: true },
    tg: { type: Number, required: true }
  }],
  period: { type: String, required: true }
})

targetPigeonSchema.index({ area: 1, period: 1 }, { unique: true })

module.exports = conn => {
  return {
    TargetPigeon: conn.model('TargetPigeon', targetPigeonSchema, 'targetPigeons')
  }
}
