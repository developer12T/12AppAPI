const mongoose = require('mongoose')
require('dotenv').config()

const connectDBAppCA = async () => {
    try {
        const conn = await mongoose.connect(process.env.CA_DB_URI)
        console.log('Cash Database connected')
        return conn
    } catch (error) {
        console.error('Cash Database connection error:', error)
        process.exit(1)
    }
}

module.exports = connectDBAppCA