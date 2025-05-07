// const storeModel = require('../../models/cash/store');
const { dbCA, dbCR } = require('../config/db');

function getModelsByChannel(channel,res,model) {
    let conn;
  
    switch (channel) {
      case 'credit':
        conn = dbCR;
        break;
      case 'cash':
        conn = dbCA;
        break;
      default:
          res.status(400).json({
            status: 400,
            message: "channel is required or invalid"
          });
    }
  
    return model(conn); // return { Store, TypeStore }
  }
  
  module.exports = { getModelsByChannel };