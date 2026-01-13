const { sequelize, DataTypes } = require('../../config/DATA_API_M3')

const Customer_APIM3 = sequelize.define(
  'OCUSMA',
  {
    customerNo: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'OKCUNO'
    },
    customerStatus: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'OKSTAT'
    },
    customerChannel: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKCUCL'
    },
    customerName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKCUNM'
    },
    coNo: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'OKCONO'
    },
    addressID: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKADID'
    },
    customerAddress1: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKCUA1'
    },
    customerAddress2: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKCUA2'
    },
    customerAddress3: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKCUA3'
    },
    customerAddress4: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKCUA4'
    },
    customerPoscode: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKPONO'
    },
    customerPhone: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKPHNO'
    },
    creditTerm: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKTEPY'
    },
    customerCoType: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKORTP'
    },
    warehouse: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKWHLO'
    },
    saleZone: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKSDST'
    },
    saleTeam: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKCFC8'
    },
    OKCFC1: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKCFC1'
    },
    OKCFC3: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKCFC3'
    },
    OKCFC6: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKCFC6'
    },
    salePayer: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKPYNO'
    },
    creditLimit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'OKCRL2'
    },
    taxno: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKVRNO'
    },
    saleCode: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKSMCD'
    },
    OKRESP: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKRESP'
    },
    OKUSR1: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKUSR1'
    },
    OKUSR2: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKUSR2'
    },
    OKUSR3: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKUSR3'
    },
    OKDTE1: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'OKDTE1'
    },
    OKDTE2: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'OKDTE2'
    },
    OKDTE3: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'OKDTE3'
    },
    OKRGDT: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'OKRGDT'
    },
    OKRGTM: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'OKRGTM'
    },
    OKLMDT: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'OKLMDT'
    },
    OKCHID: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKCHID'
    },
    OKLMTS: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'OKLMTS'
    },
    OKALCU: {
      type: DataTypes.INTEGER,

      field: 'OKALCU'
    },
    OKCSCD: {
      type: DataTypes.INTEGER,

      field: 'OKCSCD'
    },
    OKECAR: {
      type: DataTypes.INTEGER,

      field: 'OKECAR'
    },
    OKFACI: {
      type: DataTypes.INTEGER,

      field: 'OKFACI'
    },
    OKINRC: {
      type: DataTypes.INTEGER,

      field: 'OKINRC'
    },
    OKCUCD: {
      type: DataTypes.INTEGER,

      field: 'OKCUCD'
    },
    OKPYCD: {
      type: DataTypes.INTEGER,

      field: 'OKPYCD'
    },
    OKMODL: {
      type: DataTypes.INTEGER,

      field: 'OKMODL'
    },
    OKTEDL: {
      type: DataTypes.INTEGER,

      field: 'OKTEDL'
    },
    OKFRE1: {
      type: DataTypes.INTEGER,

      field: 'OKFRE1'
    },
    OKCFC4: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OKCFC4'
    }
  },
  {
    freezeTableName: true,
    timestamps: false,
    createdAt: false,
    updatedAt: false,
    primaryKey: false
  }
)

module.exports = {
  Customer_APIM3
}
