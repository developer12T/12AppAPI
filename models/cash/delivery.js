const mongoose = require('mongoose')


const deliverySchema = new mongoose.Schema({
  deliveryDateStart: { type: Date },
  deliveryDateEnd: { type: Date },
  preparationDays: { type: Number}, // ตัวอย่างใช้จำนวนวัน
  displayDays: { type: Number},
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

module.exports = (conn) => {
    return {
      Delivery: conn.model('Delivery', deliverySchema,'delivery'),
    };
  };