const mongoose = require('mongoose')
const { dbCA } = require('../../config/db')


const listCartProduct = mongoose.Schema({
    id: { type: String },
    qty: { type: String  ,require: true,},
    price: { type: Number, require: true, default: 0 },
    unit: { type: String  ,require: true,},
})


const cartSchema = mongoose.Schema(
  {
    type: { type: String, require: true },
    area: { type: String, require: true },
    storeId: { type: String },
    sku: { type: String },
    listProduct: [listCartProduct],


  },
  {
    timestamps: true
  }
)

// const Cart = dbCA.model('Cart', cartSchema)
// module.exports = { Cart }
module.exports = conn => {
  return {
    NoodleCart: conn.model('NoodleCart', cartSchema,'noodleCarts')
  }
}
