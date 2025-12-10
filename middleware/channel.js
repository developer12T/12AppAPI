// const storeModel = require('../../models/cash/store');
const { dbCA, dbCR, dbPC, dbUSER, dbCA_UAT,dbPC_UAT } = require('../config/db')

function getModelsByChannel(channel, res, model) {
  let conn

  switch (channel) {
    case 'credit':
      conn = dbCR
      break
    case 'cash':
      conn = dbCA
      break
    case 'pc':
      conn = dbPC
      break
    case 'user':
      conn = dbUSER
      break
    case 'uat':
      conn = dbCA_UAT
      break
    case 'pc_uat':
      conn = dbPC_UAT
      break
    default:
      res.status(400).json({
        status: 400,
        message: 'channel is required or invalid'
      })
  }

  return model(conn)
}

module.exports = { getModelsByChannel }
