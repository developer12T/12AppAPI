const mongoose = require("mongoose");
const { dbCA } = require("../../config/db");

const listOrderProductSchema = new mongoose.Schema({
  id: { type: String, require: true },
  sku: { type: String },
  groupCode : { type: String },
  price: { type: Number },
  // ingredients: [
  //   {
  //     type: { type: String },
  //     id: { type: String },
  //     name: { type: String },
  //     nameTH: { type: String },
  //     groupCode: { type: String },
  //     price: { type: Number },
  //   },
  // ],
});


const noodleOrderSchema = new mongoose.Schema(
  {
    type: { type: String, require: true },
    orderId: { type: String, require: true, unique: true },
    area : { type: String, require: true },
    status: {
      type: String,
      require: true,
      enum: ["pending", "completed", "canceled", "rejected"],
      default: "pending",
    },
    statusTH: {
      type: String,
      require: true,
      enum: ["รอนำเข้า", "สำเร็จ", "ยกเลิก", "ถูกปฏิเสธ"],
      default: "รอนำเข้า",
    },
    listProduct: [listOrderProductSchema],
    subtotal: { type: Number, require: true },
    discount: { type: Number, default: 0 },
    discountProduct: { type: Number, default: 0 },
    vat: { type: Number, default: 0 },
    totalExVat: { type: Number, default: 0 },
    qr: { type: Number, default: 0 },
    total: { type: Number, require: true },
    paymentMethod: { type: String, require: true },
    paymentStatus: { type: String, default: "unpaid" },
    reference: { type: String, require: true, default: "" },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    period: { type: String, require: true },
  },
  {
    timestamps: true,
  }
);

// const Order = dbCA.model('Order', orderSchema)
// module.exports = { Order }

module.exports = (conn) => {
  return {
    NoodleSales: conn.model("noodleSales", noodleOrderSchema, "noodleSales"),
  };
};
