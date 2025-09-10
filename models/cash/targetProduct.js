const mongoose = require('mongoose')
const { dbCA } = require('../../config/db')
const { period } = require('../../utilities/datetime')

const targetProductSchema = new mongoose.Schema({
  id: { type: Number, require: true },
  zone: { type: String, require: true },
  area: { type: String, require: true },
  ch: { type: String, require: true },
  grp_target: { type: String, require: true },
  tg: { type: Number, require: true },
  all_qty_target: { type: Number, require: true },
  all_amt_target: { type: Number, require: true },
  period: { type: String, require: true },
  time_stamp: { type: String, require: true }
})

module.exports = conn => {
  return {
    targetProduct: conn.model('TargetProduct', targetProductSchema,'targetProducts')
  }
}
