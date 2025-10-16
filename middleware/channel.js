// const storeModel = require('../../models/cash/store');
const { dbCA, dbCR,dbPC } = require('../config/db');

function getModelsByChannel(channel,res,model) {
    let conn;
  
    switch (channel) {
      case 'credit':
        conn = dbCR;
        break;
      case 'cash':
        conn = dbCA;
        break;
      case 'pc':
        conn = dbPC;
        break;
      default:
          res.status(400).json({
            status: 400,
            message: "channel is required or invalid"
          });
    }
  
    return model(conn); 
  }
  
  module.exports = { getModelsByChannel };