const mongoose = require('mongoose')
const { dbCA } = require('../../config/db')
const { dbCR } = require('../../config/db')

const ListOrderSchema = new mongoose.Schema({
  number: { type: Number },
  orderId: { type: String },
  status: { type: String, default: '0' },
  statusText: { type: String, default: '' },
  date: { type: Date }
})

const ListStoreSchema = new mongoose.Schema({
  storeInfo: { type: String, ref: 'Store', required: true },
  note: { type: String, default: '' },
  image: { type: String, default: '' },
  latitude: { type: String, default: '0.00' },
  longtitude: { type: String, default: '0.00' },
  status: { type: String, default: '0' },
  statusText: { type: String, default: '' },
  date: { type: Date, default: Date.now },
  listOrder: [ListOrderSchema]
})

const RouteSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, index: true },
    period: { type: String, required: true, index: true },
    area: { type: String, required: true },
    zone: { type: String, required: true },
    team: { type: String, required: true },
    day: { type: String, required: true },
    listStore: [ListStoreSchema],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true // ✅ Mongoose จะสร้าง createdAt / updatedAt ให้อัตโนมัติ
  }
);

const RouteChangeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, index: true },
    period: { type: String, required: true, index: true },
    area: { type: String, required: true },
    zone: { type: String, required: true },
    team: { type: String, required: true },
    day: { type: String, required: true },
    listStore: [ListStoreSchema],
    status: { type: String, default: 'pending' },
    statusTH: { type: String, default: 'รอดำเนินการ' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true // ✅ Mongoose จะสร้าง createdAt / updatedAt ให้อัตโนมัติ
  }
);




RouteSchema.virtual('storeAll').get(function () {
  return this.listStore.length
})
RouteSchema.virtual('storePending').get(function () {
  return this.listStore.filter(store => store.status === '0').length
})
RouteSchema.virtual('storeSell').get(function () {
  return this.listStore.filter(store => store.status === '3').length
})
RouteSchema.virtual('storeNotSell').get(function () {
  return this.listStore.filter(store => store.status === '2').length
})
RouteSchema.virtual('storeCheckInNotSell').get(function () {
  return this.listStore.filter(store => store.status === '1').length
})
RouteSchema.virtual('storeTotal').get(function () {
  return this.listStore.filter(store =>
    ['1', '2', '3'].includes(store.status)
  ).length
})
RouteSchema.virtual('percentComplete').get(function () {
  return parseFloat(
    (((this.storeTotal / this.storeAll) * 100 * 360) / 100).toFixed(2)
  )
})
RouteSchema.virtual('complete').get(function () {
  return parseFloat(((this.storeTotal / this.storeAll) * 100).toFixed(2))

})

RouteSchema.virtual('percentVisit').get(function () {
  return parseFloat(((this.storeTotal / this.storeAll) * 100).toFixed(2))
})
RouteSchema.virtual('percentEffective').get(function () {
  if (this.storeSell === 0) return 0
  return parseFloat(((this.storeSell / this.storeAll) * 100).toFixed(2))
})
RouteSchema.set('toJSON', { virtuals: true })
RouteSchema.set('toObject', { virtuals: true })

const listStoreChange = mongoose.Schema({
  storeInfo: { type: String, ref: 'Store', required: true }
})

// const RouteChangeLogSchema = new mongoose.Schema({
//   area: { type: String, required: true },
//   period: { type: String, required: true },
//   type: { type: String, required: true, default: '' },
//   fromRoute: { type: String, required: true },
//   toRoute: { type: String, required: true },
//   changedBy: { type: String, required: true },
//   changedDate: { type: Date },
//   listStore: [listStoreChange],
//   status: { type: String, default: '0' },
//   approvedBy: { type: String, default: '' },
//   approvedDate: { type: String, default: '' }
// })

const approveSchema = mongoose.Schema({
  dateSend: { type: Date, default: Date.now },
  dateAction: { type: Date, default: Date.now },
  appPerson: { type: String, require: true },
})


const RouteChangeLogSchema = new mongoose.Schema({
  id: { type: String, required: true },
  period: { type: String, required: true },
  area: { type: String, required: true },
  zone: { type: String, required: true },
  storeId: { type: String, required: true },
  name: { type: String, required: true },
  latitude: { type: String },
  longtitude: { type: String },
  routeId: { type: String, required: true },
  status: { type: String, required: true },
  statusTH: { type: String, required: true },
  approve: approveSchema,
})

const RouteSettingSchema = new mongoose.Schema({
  area: { type: String },
  period: { type: String, required: true },
  lock: { type: Boolean, required: true },
  startDate: { type: String, required: true },
  lockRoute: [{
    id: { type: String, unique: true, required: true },
    route: { type: String,required: true },
    lock : { type: Boolean, required: true },
    listStore:[{
      storeId: {type : String},
      storeInfo: {type : String},
      lock: { type: Boolean, required: true  }
    }]

  }],


  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})








// const Route = dbCA.model('Route', RouteSchema)
// const RouteChangeLog = dbCA.model('RouteChangeLog', RouteChangeLogSchema)

// const Route = dbCR.model('Route', RouteSchema)
// const RouteChangeLog = dbCR.model('RouteChangeLog', RouteChangeLogSchema)
// module.exports = { Route, RouteChangeLog }

module.exports = (conn) => {
  return {
    Route: conn.model('Route', RouteSchema),
    RouteChange: conn.model('RouteChange', RouteChangeSchema),
    RouteChangeLog: conn.model('RouteChangeLog', RouteChangeLogSchema),
    RouteSetting: conn.model('RouteSetting', RouteSettingSchema),
  };
};