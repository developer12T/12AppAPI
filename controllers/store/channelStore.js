const storeModel = require('../../models/cash/store');
const { dbCA, dbCR } = require('../../config/db');

function getStoreModelsByChannel(channel,res) {
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
  
    return storeModel(conn); // return { Store, TypeStore }
  }
  
  module.exports = { getStoreModelsByChannel };