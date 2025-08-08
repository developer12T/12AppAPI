const { Sequelize, DataTypes, QueryTypes } = require('sequelize')
const mssql = require('mssql')
const {
  M3_DATABASE,
  M3_HOST,
  M3_USER,
  M3_PASSWORD
} = require('../config/index')

const sequelize = new Sequelize(M3_DATABASE, M3_USER, M3_PASSWORD, {
  pool: {
    max: 20,
    min: 4,
    idle: 10000,
    acquire: 60000,
    evict: 1000
  },
  benchmark: true,
  logging: (sql, ms) => console.log(`[SQL ${ms}ms]`, sql),
  dialect: "mssql",
  host: M3_HOST,
  schema: 'MVXJDTA',
  dialectOptions: {
    options: {
      requestTimeout: 300000, // ✅ ปล่อยได้นาน 5 นาที
      enableArithAbort: false,
      encrypt: false,
      cryptoCredentialsDetails: {
        minVersion: "TLSv1"
      }
    }
  },
  define: {
    noPrimaryKey: true
  }
});

module.exports = {
  sequelize: sequelize,
  DataTypes: DataTypes,
  QueryTypes: QueryTypes,
  mssql: mssql
}
