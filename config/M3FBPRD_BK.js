const { Sequelize, DataTypes, QueryTypes } = require('sequelize')
const mssql = require('mssql')
const {
  MS_SQL_M3FDBPRD,
  MS_SQL_SERVER,
  MS_SQL_USER,
  MS_SQL_PASSWORD
} = require('./index')

const sequelize = new Sequelize(
  MS_SQL_M3FDBPRD,
  MS_SQL_USER,
  MS_SQL_PASSWORD,
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
    host: MS_SQL_SERVER,
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
