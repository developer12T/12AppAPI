const { sequelizeBI, DataTypes } = require('../../config/powerBi')

const WithdrawCash = sequelizeBI.define(
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
    },
    SEND_DATE: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'SEND_DATE'
    },
    CHANNEL: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'CHANNEL'
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

const CustomerBI = sequelizeBI.define(
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
    tableName: 'OCUSMA', // 👈 ชื่อตารางจริง
    schema: 'dbo', // 👈 สำคัญ
    timestamps: false,
    freezeTableName: true
  }
)


const ROUTE_DETAIL = sequelizeBI.define(
  'ROUTE_DETAIL',
  {
    ROUTE_ID: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'ROUTE_ID'
    },
    PERIOD: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: false,
      field: 'PERIOD'
    },
    AREA: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: false,
      field: 'AREA'
    },
    ZONE: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: false,
      field: 'ZONE'
    },
    TEAM: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: false,
      field: 'TEAM'
    },
    DAY: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: false,
      field: 'DAY'
    },
  },
  {
    tableName: 'ROUTE_DETAIL', // 👈 ชื่อตารางจริง
    schema: 'dbo', // 👈 สำคัญ
    timestamps: false,
    freezeTableName: true
  }
)


const ROUTE_STORE = sequelizeBI.define(
  'ROUTE_STORE',
  {
    ROUTE_ID: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'ROUTE_ID'
    },
    STORE_ID: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: false,
      field: 'STORE_ID'
    },
    STORE_NAME: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: false,
      field: 'STORE_NAME'
    },
    NOTE: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: false,
      field: 'NOTE'
    },
    LATITUDE: {
      type: DataTypes.NUMBER,
      allowNull: false,
      primaryKey: false,
      field: 'LATITUDE'
    },
    LONGITUDE: {
      type: DataTypes.NUMBER,
      allowNull: false,
      primaryKey: false,
      field: 'LONGITUDE'
    },
    STATUS: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: false,
      field: 'STATUS'
    },
    STATUS_TEXT: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: false,
      field: 'STATUS_TEXT'
    },
    CHECKIN: {
      type: DataTypes.DATE,
      allowNull: false,
      primaryKey: false,
      field: 'CHECKIN'
    }
  },
  {
    tableName: 'ROUTE_STORE', // 👈 ชื่อตารางจริง
    schema: 'dbo', // 👈 สำคัญ
    timestamps: false,
    freezeTableName: true
  }
)

const ROUTE_ORDER = sequelizeBI.define(
  'ROUTE_ORDER',
  {
    ROUTE_ID: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      field: 'ROUTE_ID'
    },
    STORE_ID: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: false,
      field: 'STORE_ID'
    },
    STORE_NAME: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: false,
      field: 'STORE_NAME'
    },
    AREA: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: false,
      field: 'AREA'
    },
    ZONE: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: false,
      field: 'ZONE'
    },
    PROVINCE: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: false,
      field: 'PROVINCE'
    },
    LATITUDE: {
      type: DataTypes.NUMBER,
      allowNull: false,
      primaryKey: false,
      field: 'LATITUDE'
    },
    LONGITUDE: {
      type: DataTypes.NUMBER,
      allowNull: false,
      primaryKey: false,
      field: 'LONGITUDE'
    },
    SALE_NAME: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: false,
      field: 'SALE_NAME'
    },
    WAREHOUSE: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: false,
      field: 'WAREHOUSE'
    },
    TOTAL: {
      type: DataTypes.NUMBER,
      allowNull: false,
      primaryKey: false,
      field: 'TOTAL'
    },
    CREATED_AT: {
      type: DataTypes.DATE,
      allowNull: false,
      primaryKey: false,
      field: 'CREATED_AT'
    },


  },
  {
    tableName: 'ROUTE_ORDER', // 👈 ชื่อตารางจริง
    schema: 'dbo', // 👈 สำคัญ
    timestamps: false,
    freezeTableName: true
  }
)






module.exports = {
  WithdrawCash,
  CustomerBI,
  ROUTE_DETAIL,
  ROUTE_STORE,
  ROUTE_ORDER
}
