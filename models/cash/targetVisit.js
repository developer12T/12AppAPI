const mongoose = require('mongoose')

const targetVisitSchema = new mongoose.Schema({
  zone: { type: String, require: true },
  area: { type: String, require: true },
  saleStore: { type: Number, require: true },
  visitStore: { type: Number, require: true },
  saleStoreperDay: { type: Number, require: true },
  visitStoreperDay: { type: Number, require: true },
  period: { type: String, require: true }
})

module.exports = conn => {
  return {
    TargetVisit: conn.model('TargetVisit', targetVisitSchema, 'TargetVisit')
  }
}
