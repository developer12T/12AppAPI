const { Sequelize, DataTypes, QueryTypes } = require('sequelize')
const mssql = require('mssql')
const {
  MS_SQL_DATABASE_096,
  MS_SQL_SERVER_096,
  MS_SQL_USER_096,
  MS_SQL_PASSWORD_096
} = require('../config/index')

const sequelize = new Sequelize(
  MS_SQL_DATABASE_096,
  MS_SQL_USER_096,
  MS_SQL_PASSWORD_096,
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
    host: MS_SQL_SERVER_096,
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
