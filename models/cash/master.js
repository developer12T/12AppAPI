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

const DisributionM3 = sequelize.define(
  'MGHEAD',
  {
    coNo: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      field: 'MGTRNR'
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

const Item = sequelize.define('MITMAS', {
  companycode: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'MMCONO'
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'MMSTAT'
  },
  itemcode: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'MMITNO'
  },
  itemname: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'MMITDS'
  },
  itemdescripton: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'MMFUDS'
  },
  itemtype: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'MMITTY'
  },
  itemgroup: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'MMCFI3'
  }
}, { freezeTableName: true, timestamps: false, createdAt: false, updatedAt: false, primaryKey: false });

const ItemConvert = sequelize.define('MITAUN', {
  companycode: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'MUCONO'
  },
  factype: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'MUAUTP'
  },
  itemcode: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'MUITNO'
  },
  unit: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'MUALUN'
  },
  factor: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'MUCOFA'
  }
}, { freezeTableName: true, timestamps: false, createdAt: false, updatedAt: false, primaryKey: false });

const OOTYPE = sequelize.define(
  'OOTYPE',
  {
    OOCONO: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'OOCONO'
    },
    OOORTP: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'OOORTP'
    },
    OOOT05: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OOOT05'
    },
    OOOT34: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OOOT34'
    },
    OOSPIC: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OOSPIC'
    },
    OODPOL: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'OODPOL'
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




const NumberSeries = sequelize.define(
  "CSYNBR",
  {
    coNo: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      field: "CNCONO",
    },
    series: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: "CNNBID",
    },
    seriesType: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: "CNNBTY",
    },
    seriesName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "CNNBDE",
    },
    startNo: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "CNNBLO",
    },
    finalNo: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "CNNBHI",
    },
    lastNo: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "CNNBNR",
    },
  },
  {
    freezeTableName: true,
    timestamps: false,
    createdAt: false,
    updatedAt: false,
    primaryKey: false,
  }
);






module.exports = {
  // ItemFac,
  // ItemMaster,
  // ItemUnit,
  Item,
  ItemConvert,
  Warehouse,
  Locate,
  Balance,
  Sale,
  DisributionM3,
  NumberSeries,
  OOTYPE,
  // MGTYPE,
  // OODFLT
}







