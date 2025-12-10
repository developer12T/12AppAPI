const mongoose = require('mongoose')
require('dotenv').config()

const dbCA = mongoose.createConnection(process.env.CA_DB_URI)
const dbCR = mongoose.createConnection(process.env.CR_DB_URI)
const dbPC = mongoose.createConnection(process.env.PC_DB_URI)
const dbUSER = mongoose.createConnection(process.env.USER_DB_URI)
const dbCA_UAT = mongoose.createConnection(process.env.CA_DB_URI_UAT)
const dbPC_UAT = mongoose.createConnection(process.env.PC_DB_URI_UAT)
// const foodServiceDB = mongoose.createConnection(process.env.FS_DB_URI)

dbUSER.on('connected', () => console.log('Connected to User DB'))
dbUSER.on('error', err => console.error('User DB Error:', err))

dbCA.on('connected', () => console.log('Connected to Cash DB'))
dbCA.on('error', err => console.error('Cash DB Error:', err))
dbCR.on('connected', () => console.log('Connected to Credit DB'))
dbCR.on('error', err => console.error('Credit DB Error:', err))

dbPC.on('connected', () => console.log('Connected to PC'))
dbPC.on('error', err => console.error('PC DB Error:', err))

dbCA_UAT.on('connected', () => console.log('Connected to Cash DB UAT'))
dbCA_UAT.on('error', err => console.error('Cash DB UAT Error:', err))

dbPC_UAT.on('connected', () => console.log('Connected to PC DB UAT'))
dbPC_UAT.on('error', err => console.error('Cash DB UAT Error:', err))

module.exports = {
  dbCA,
  dbCR,
  dbPC,
  dbUSER,
  dbCA_UAT,
  dbPC_UAT
}
