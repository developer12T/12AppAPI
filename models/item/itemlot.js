const { sequelize, DataTypes } = require('../../config/itemdb')
const Item = sequelize.define(
  'MASPRD',
  {
    itemCode: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      field: 'MMITNO'
    },
    itemName: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'MMFUDS'
    },
    lot: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'Lot'
    },
    date: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'LMMFDT'
    },
    expireDate: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'LMEXPI'
    },

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
  Item
}
