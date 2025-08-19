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

const Customer = sequelize.define(
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
    }
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
    MGTRSL: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      field: 'MGTRSL'
    },
    MGTRSH: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'MGTRSH'
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

const MHDISL = sequelize.define(
  'MHDISL',
  {
    coNo: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'URRIDN'
    },
    productId: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'URITNO'
    },
    qtyPcs: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'URTRQT'
    },
    withdrawUnit: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'URALUN'
    },
    weightGross: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'URGRWE'
    },
    weightNet: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'URNEWE'
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

const MHDISH = sequelize.define(
  'MHDISH',
  {
    coNo: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'OQRIDN'
    },
    weightNet: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      field: 'OQNEWE'
    },
    weightGross: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'OQGRWE'
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

const Item = sequelize.define(
  'MITMAS',
  {
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
  },
  {
    freezeTableName: true,
    timestamps: false,
    createdAt: false,
    updatedAt: false,
    primaryKey: false
  }
)

const ItemConvert = sequelize.define(
  'MITAUN',
  {
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
  },
  {
    freezeTableName: true,
    timestamps: false,
    createdAt: false,
    updatedAt: false,
    primaryKey: false
  }
)

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
  'CSYNBR',
  {
    coNo: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      field: 'CNCONO'
    },
    series: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'CNNBID'
    },
    seriesType: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'CNNBTY'
    },
    seriesName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'CNNBDE'
    },
    startNo: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'CNNBLO'
    },
    finalNo: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'CNNBHI'
    },
    lastNo: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'CNNBNR'
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

const ItemLotM3 = sequelize.define(
  'MILOMA',
  {
    coNo: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      field: 'LMCONO'
    },
    itemCode: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'LMITNO'
    },
    lot: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'LMBANO'
    },
    expireDate: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'LMRGDT'
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

const Promotion = sequelize.define(
  'OPROHM',
  {
    coNo: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      field: 'FZCONO'
    },
    proId: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FZPIDE'
    },
    proName: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FZTX15'
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

const PromotionStore = sequelize.define(
  'OPROMC',
  {
    coNo: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      field: 'FBCONO'
    },
    proId: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBPIDE'
    },
    FBCUNO: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBCUNO'
    },
    FBDIVI: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBDIVI'
    },
    FBCUTP: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBCUTP'
    },
    customerChannel: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBCUCL'
    },
    saleCode: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBSMCD'
    },
    orderType: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBORTP'
    },
    warehouse: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBWHLO'
    },
    zone: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBSDST'
    },
    FBCSCD: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBCSCD'
    },
    FBPYNO: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBPYNO'
    },
    posccode: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBPONO'
    },
    area: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBCFC1'
    },
    FBCFC3: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBCFC3'
    },
    FBCFC6: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBCFC6'
    },
    FBFVDT: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBFVDT'
    },
    FBLVDT: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBLVDT'
    },
    FBRGDT: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBRGDT'
    },
    FBRGTM: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBRGTM'
    },
    FBLMDT: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBLMDT'
    },
    FBCHNO: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBCHNO'
    },
    FBCHID: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBCHID'
    },
    FBPRI2: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBPRI2'
    },
    FBFRE1: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBFRE1'
    },
    FBECAR: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'FBECAR'
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
  // ItemFac,
  // ItemMaster,
  // ItemUnit,
  ItemLotM3,
  MHDISH,
  MHDISL,
  Item,
  ItemConvert,
  Warehouse,
  Locate,
  Balance,
  Sale,
  DisributionM3,
  NumberSeries,
  OOTYPE,
  Customer,

  PromotionStore
  // MGTYPE,
  // OODFLT
}
