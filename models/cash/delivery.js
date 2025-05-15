const mongoose = require('mongoose')
const moment = require('moment-timezone');


const deliverySchema = new mongoose.Schema({
  deliveryDateStart: { type: Date },
  deliveryDateEnd: { type: Date },
  preparationDays: { type: Number}, // ตัวอย่างใช้จำนวนวัน
  displayDays: { type: Number},
  createdAt: {
    type: Date,
    default: () => moment.tz('Asia/Bangkok').toDate()
  },
  updatedAt: {
    type: Date,
    default: () => moment.tz('Asia/Bangkok').toDate()
  }
});

module.exports = (conn) => {
    return {
      Delivery: conn.model('Delivery', deliverySchema,'delivery'),
    };
  };