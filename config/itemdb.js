const { Sequelize, DataTypes, QueryTypes } = require('sequelize')
const mssql = require('mssql')
const {
  ITEM_SERVER_DATABASE,
  ITEM_SERVER,
  ITEM_SERVER_USER,
  ITEM_SERVER_PASSWORD
} = require('../config/index')

const sequelize = new Sequelize(
  ITEM_SERVER_DATABASE,
  ITEM_SERVER_USER,
  ITEM_SERVER_PASSWORD,
  {
    // const sequelize = new Sequelize('M3FDBTST', 'sa', 'One2@@', {
    dialect: 'mssql',
    host: ITEM_SERVER,
    // schema: 'DATA_ITEM',
    dialectOptions: {
      options: {
        enableArithAbort: false,
        encrypt: false,
        cryptoCredentialsDetails: {
          minVersion: 'TLSv1'
          // minVersion: 'TLSv1_2'
        }
      }
    },
    define: {
      noPrimaryKey: true
    },
    logging: console.log
  }
)

module.exports = {
  sequelize: sequelize,
  DataTypes: DataTypes,
  QueryTypes: QueryTypes,
  mssql: mssql
}
