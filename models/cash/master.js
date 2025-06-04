const { sequelize, DataTypes } = require('../../config/m3db')


const Locate = sequelize.define(
    'MITLOC',
    {
      coNo: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
        field: 'MLCONO'
      },
      warehouse: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true,
        field: 'MLWHLO'
      },
      itemCode: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true,
        field: 'MLITNO'
      },
      location: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'MLWHSL'
      },
      lot: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'MLBANO'
      },
      itemOnHand: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'MLSTQT'
      },
      itemallocated: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'MLALQT'
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

  const Balance = sequelize.define(
    'MITBAL',
    {
      coNo: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
        field: 'MBCONO'
      },
      warehouse: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true,
        field: 'MBWHLO'
      },
      itemCode: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true,
        field: 'MBITNO'
      },
      itemPcs: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'MBSTQT'
      },
      allocateMethod: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'MBALMT'
      },
      itemallocated: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'MBALQT'
      },
      itemAllowcatable: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'MBAVAL'
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

  const Warehouse = sequelize.define(
    'MITWHL',
    {
      coNo: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
        field: 'MWCONO'
      },
      warehouse: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
        field: 'MWWHLO'
      },
      warehouseName: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'MWWHNM'
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

  const Sale = sequelize.define(
    'OOHEAD',
    {
      coNo: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
        field: 'OAORNO'
      },
      // warehouse: {
      //   type: DataTypes.INTEGER,
      //   allowNull: false,
      //   primaryKey: true,
      //   field: 'MWWHLO'
      // },
      // warehouseName: {
      //   type: DataTypes.STRING,
      //   allowNull: false,
      //   field: 'MWWHNM'
      // }
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
    // ItemFac,
    // ItemMaster,
    // ItemUnit,
    Warehouse,
    Locate,
    Balance,
    Sale
    // Policy,
    // OOTYPE,
    // MGTYPE,
    // OODFLT
  }







