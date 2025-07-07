const mongoose = require('mongoose')
const { dbCA } = require('../../config/db')

const list = mongoose.Schema({
    value: { type: String, default: '0' },
    name: { type: String }
})

const optionSchema = mongoose.Schema({
    module: { type: String, require: true },
    type: { type: String, require: true },
    description: { type: String, require: true },
    list: [list],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
})

// const Option = dbCA.model('Option', optionSchema)
// module.exports = { Option }


module.exports = (conn) => {
    return {
        Option: conn.model('Option', optionSchema),
    };
  };