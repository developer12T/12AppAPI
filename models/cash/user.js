const mongoose = require('mongoose')
const { dbCA } = require('../../config/db')

const imageSchema = mongoose.Schema({
    name: { type: String },
    path: { type: String },
    type: { type: String },
})

const userSchema = mongoose.Schema({
    id: { type: String, require: true },
    username: { type: String, require: true },
    password: { type: String, require: true },
    saleCode: { type: String, require: true },
    salePayer: { type: String, require: true },
    firstName: { type: String, require: true },
    surName: { type: String, require: true },
    tel: { type: String, require: true },
    zone: { type: String, require: true },
    area: { type: String, require: true },
    warehouse: { type: String, require: true },
    role: { type: String, require: true },
    status: { type: String, require: true },
    image: [imageSchema],
})

const User = dbCA.model('User', userSchema)
module.exports = { User }