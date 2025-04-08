const { Sequelize, DataTypes, QueryTypes } = require("sequelize");
const mssql = require("mssql");
const { M3_DATABASE, M3_HOST, M3_USER, M3_PASSWORD } = require("../config/index");

const sequelize = new Sequelize(M3_DATABASE, M3_USER, M3_PASSWORD, {
  // const sequelize = new Sequelize('M3FDBTST', 'sa', 'One2@@', {
  dialect: "mssql",
  host: M3_HOST,
  schema: "MVXJDTA",
  dialectOptions: {
    options: {
      enableArithAbort: false,
      encrypt: false,
      cryptoCredentialsDetails: {
        minVersion: "TLSv1",
        // minVersion: 'TLSv1_2'
      },
    },
  },
  define: {
    noPrimaryKey: true,
  },
  logging: console.log
});

module.exports = {
  sequelize: sequelize,
  DataTypes: DataTypes,
  QueryTypes: QueryTypes,
  mssql: mssql,
};
