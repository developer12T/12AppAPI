const { sequelize, DataTypes } = require('../../config/powerBi')

const WithdrawCash = sequelize.define(
  'withdrawCash',
  {
    WD_NO: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      field: 'WD_NO'
    },
    WD_STATUS: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'WD_STATUS'
    },
    ITEM_CODE: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'ITEM_CODE'
    },
    TOTAL_WEIGHT: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'TOTAL_WEIGHT'
    },
    ITEM_WEIGHT: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'ITEM_WEIGHT'
    },
    SHIP_QTY: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'SHIP_QTY'
    },
    STATUS: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'STATUS'
    },
    STATUS_TH: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'STATUS_TH'
    },
    REMARK_WAREHOUSE: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'REMARK_WAREHOUSE'
    },
    IS_NPD: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'IS_NPD'
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
  WithdrawCash
}
