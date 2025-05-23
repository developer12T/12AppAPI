const mongoose = require('mongoose')


const sendMoneySchema = mongoose.Schema({
    area: { type: String, require: true },
    date: { type: Date, require: true },
    sendmoney: { type: Number, require: true },
    status: { type: String, require: true },    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
})


module.exports = (conn) => {
    return {
      SendMoney: conn.model('sendmoney', sendMoneySchema, 'sendmoney'),


    };
  };