const mongoose = require('mongoose')
const { dbCA } = require('../../config/db')


const listCartProduct = mongoose.Schema({
    sku: { type: String, require: true, },
    id: { type: String, require: true, },
    qty: { type: Number  ,require: true,},
    price: { type: Number, require: true, default: 0 },
    unit: { type: String  ,require: true,},
})


const cartSchema = mongoose.Schema(
  {
    type: { type: String, require: true },
    area: { type: String, require: true },
    storeId: { type: String },
    
    listProduct: [listCartProduct],
    total :{ type:Number ,require:true }

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
