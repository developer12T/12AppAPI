const mongoose = require("mongoose");
const { dbCA } = require("../../config/db");

const itemSchema = mongoose.Schema(
  {
    type: { type: String },
    id: { type: String, require: true },
    name: { type: String, },
    nameTh: { type: String },
    groupCode: { type: String },
    price: { type: Number },

  },
  {
    timestamps: true,
  }
);

// const Cart = dbCA.model('Cart', cartSchema)
// module.exports = { Cart }
module.exports = (conn) => {
  return {
    NoodleItems: conn.model("NoodleItems", itemSchema, "noodleItems"),
  };
};
