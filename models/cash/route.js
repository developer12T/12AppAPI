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

const RouteSchema = new mongoose.Schema({
  id: { type: String, required: true, index: true },
  period: { type: String, required: true, index: true },
  area: { type: String, required: true },
  day: { type: String, required: true },
  listStore: [ListStoreSchema]
})

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
RouteSchema.virtual('percentVisit').get(function () {
  return parseFloat(((this.storeTotal / this.storeAll) * 100).toFixed(2))
})
RouteSchema.virtual('percentEffective').get(function () {
  if (this.storeSell === 0) return 0
  return parseFloat(((this.storeSell / this.storeTotal) * 100).toFixed(2))
})
RouteSchema.set('toJSON', { virtuals: true })
RouteSchema.set('toObject', { virtuals: true })

const listStoreChange = mongoose.Schema({
  storeInfo: { type: String, ref: 'Store', required: true }
})

const RouteChangeLogSchema = new mongoose.Schema({
  area: { type: String, required: true },
  period: { type: String, required: true },
  type: { type: String, required: true, default: '' },
  fromRoute: { type: String, required: true },
  toRoute: { type: String, required: true },
  changedBy: { type: String, required: true },
  changedDate: { type: Date },
  listStore: [listStoreChange],
  status: { type: String, default: '0' },
  approvedBy: { type: String, default: '' },
  approvedDate: { type: String, default: '' }
})

// const Route = dbCA.model('Route', RouteSchema)
// const RouteChangeLog = dbCA.model('RouteChangeLog', RouteChangeLogSchema)

// const Route = dbCR.model('Route', RouteSchema)
// const RouteChangeLog = dbCR.model('RouteChangeLog', RouteChangeLogSchema)
// module.exports = { Route, RouteChangeLog }


module.exports = (conn) => {
  return {
    Route: conn.model('Route', RouteSchema),
    RouteChangeLog: conn.model('RouteChangeLog', RouteChangeLogSchema),
  };
};