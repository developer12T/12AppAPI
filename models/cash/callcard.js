const mongoose = require('mongoose')

const CallCardSchema = new mongoose.Schema(
  {
    storeId: { type: String, required: true },
    storeName: { type: String, required: true },
    area: { type: String, required: true },
    period: { type: String, required: true }, // YYYYMM เช่น 202507
    commercialRegistration: { type: String, default: '' },
    creditlimit: { type: Number, default: 0 },
    creditTerm: { type: String, default: '' },
    purchaser: { type: String, default: '' },
    payer: { type: String, default: '' },
    stockKeeper: { type: String, default: '' },
    stockKeeperPhone: { type: String, default: '' },
    flowAction: [{ type: String, default: '' }],

    detailStore: {
      floor: { type: String, default: '' },
      marketStall: { type: String, default: '' },
      warehouse: { type: String, default: '' },
      owner: { type: Boolean, default: false },
      rented: { type: Boolean, default: false },
      takeover: { type: Boolean, default: false },
      remainingContractTerm: { type: String, default: '' }
    },

    dayilyVisit: {
      monday: { type: String, default: '' },
      tuseday: { type: String, default: '' },
      wednesday: { type: String, default: '' },
      thuresday: { type: String, default: '' },
      friday: { type: String, default: '' }
    },

    note: { type: String, default: '' },
    googlemap: [{ type: String, default: '' }],

    visit: [
      {
        date: { type: String, default: '' }, // หรือใช้ Date ก็ได้ (ถ้าต้องการ)
        listProduct: [
          {
            productId: { type: String, default: '' },
            productName: { type: String, default: '' },
            stock: { type: String, default: '' },
            lot: { type: String, default: '' },
            order: { type: String, default: '' }
          }
        ],
        summaryOrder: { type: Number, default: 0 },
        summaryCN: { type: Number, default: 0 },
        summarySendmoney: { type: Number, default: 0 }
      }
    ],

    summaryOrder: { type: Number, default: 0 },
    summaryCN: { type: Number, default: 0 },
    summarySendmoney: { type: Number, default: 0 }
  },
  { timestamps: true }
)

module.exports = conn => {
  return {
    CallCard: conn.model('CallCard', CallCardSchema)
  }
}
