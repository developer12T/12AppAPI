const { Sequelize, DataTypes, QueryTypes } = require('sequelize')
const mssql = require('mssql')
const {
  POWERBI_DATABASE,
  POWERBI_HOST,
  POWERBI_USER,
  POWERBI_PASSWORD
} = require('../config/index')

const sequelize = new Sequelize(
  POWERBI_DATABASE,
  POWERBI_USER,
  POWERBI_PASSWORD,
  {
    pool: {
      max: 20,
      min: 4,
      idle: 10000,
      acquire: 60000,
      evict: 1000
    },
    benchmark: true,
    logging: (sql, ms) => console.log(`[SQL ${ms}ms]`, sql),
    dialect: 'mssql',
    host: POWERBI_HOST,
    dialectOptions: {
      options: {
        requestTimeout: 300000, // ✅ ปล่อยได้นาน 5 นาที
        enableArithAbort: false,
        encrypt: false,
        cryptoCredentialsDetails: {
          minVersion: 'TLSv1'
        }
      }
    }
    // define: {
    //   noPrimaryKey: true
    // }
  }
)

module.exports = {
  sequelize: sequelize,
  DataTypes: DataTypes,
  QueryTypes: QueryTypes,
  mssql: mssql
}
