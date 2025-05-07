const mongoose = require('mongoose')
require('dotenv').config()

const dbCA = mongoose.createConnection(process.env.CA_DB_URI)
const dbCR = mongoose.createConnection(process.env.CR_DB_URI)
// const creditDB = mongoose.createConnection(process.env.CR_DB_URI)
// const foodServiceDB = mongoose.createConnection(process.env.FS_DB_URI)

dbCA.on('connected', () => console.log('Connected to Cash DB'))
dbCA.on('error', (err) => console.error('Cash DB Error:', err))
dbCR.on('connected', () => console.log('Connected to Credit DB'))
dbCR.on('error', (err) => console.error('Credit DB Error:', err))

module.exports = { dbCA,dbCR }