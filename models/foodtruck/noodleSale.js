const mongoose = require("mongoose");
const { dbCA } = require("../../config/db");

const listOrderProductSchema = new mongoose.Schema({
  type :{ type: String, require: true, },
  id: { type: String, require: true, },
  name: { type: String, require: true, },
  sku: { type: String, require: true, },
  qty: { type: Number, require: true, },
  unitPrice: { type: Number },
  price: { type: Number, require: true, default: 0 },
  unit: { type: String, require: true, },
  time: { type: String },
  remark:{ type: String },

});

const orderStoreSchema = new mongoose.Schema({
  storeId: { type: String, require: true },
  name: { type: String, require: true },
  type: { type: String },
  address: { type: String, require: true },
  taxId: { type: String, require: true },
  tel: { type: String, require: true },
  area: { type: String, require: true },
  zone: { type: String, require: true },
  isBeauty: { type: String, require: false }
})


const orderSaleSchema = new mongoose.Schema({
  saleCode: { type: String, require: true },
  salePayer: { type: String, require: true },
  name: { type: String, require: true },
  tel: { type: String, require: true },
  warehouse: { type: String, require: true }
})


const orderShipingSchema = new mongoose.Schema({
  default: { type: String },
  shippingId: { type: String },
  address: { type: String },
  district: { type: String },
  subDistrict: { type: String },
  province: { type: String },
  postCode: { type: String },
  latitude: { type: String },
  longtitude: { type: String }
})


const noodleOrderSchema = new mongoose.Schema(
  {
    type: { type: String, require: true },
    orderId: { type: String, require: true, unique: true },
    number: { type: Number },
    waiting: { type: Number },
    sale: orderSaleSchema,
    store: orderStoreSchema,
    shipping: orderShipingSchema,
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
