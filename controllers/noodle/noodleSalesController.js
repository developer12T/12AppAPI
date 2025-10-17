const express = require("express");

const { getModelsByChannel } = require("../../middleware/channel");
const userModel = require("../../models/cash/user");
const typetruck = require("../../models/cash/typetruck");
const noodleCartModel = require("../../models/foodtruck/noodleCart");
const cartModel = require("../../models/cash/cart");
const noodleSaleModel = require("../../models/foodtruck/noodleSale");
const noodleItemModel = require("../../models/foodtruck/noodleItem");
const { generateOrderIdFoodTruck } = require("../../utilities/genetateId");
const {
  to2,
  getQty,
  updateStockMongo,
  getPeriodFromDate
} = require('../../middleware/order')
const orderTimestamps = {};

exports.checkout = async (req, res) => {
  // const transaction = await sequelize.transaction();
  try {
    const { type, area, storeId, period, payment } = req.body;

    const channel = req.headers["x-channel"];
    const { NoodleSales } = getModelsByChannel(channel, res, noodleSaleModel);
    const { NoodleCart } = getModelsByChannel(channel, res, noodleCartModel);
    const { NoodleItems } = getModelsByChannel(channel, res, noodleItemModel);

    if (!type || !area || !storeId || !payment) {
      return res
        .status(400)
        .json({ status: 400, message: "Missing required fields!" });
    }

    const now = Date.now();
    const lastUpdate = orderTimestamps[storeId] || 0;
    const ONE_MINUTE = 60 * 1000;

    if (now - lastUpdate < ONE_MINUTE) {
      return res.status(429).json({
        status: 429,
        message:
          "This order was updated less than 1 minute ago. Please try again later!",
      });
    }
    orderTimestamps[storeId] = now;

    const cart = await NoodleCart.findOne({ type, area, storeId });
    if (!cart || cart.length === 0) {
      return res
        .status(404)
        .json({ status: 404, message: "NoodleCart is empty!" });
    }

    const noodleItem = await NoodleItems.findOne({ id: cart.id });

    const orderId = await generateOrderIdFoodTruck(area, channel, res);

    const total = to2(cart.price); // ราคารวมภาษี เช่น 45
    const totalExVat = to2(total / 1.07); // แยกภาษีออก
    const vat = to2(total - totalExVat); // ส่วนที่เป็น VAT

    const noodleOrder = {
      type: type,
      orderId: orderId,
      status: "pending",
      statusTH: "รอนำเข้า",
      listProduct: {
        id: cart.id,
        sku: cart.sku,
        groupCode: noodleItem.groupCode,
        price: cart.price,
      },
      subtotal: cart.subtotal,
      discount: 0,
      discountProduct: 0,
      vat: vat,
      totalExVat: totalExVat,
      qr: 0,
      total: total,
      paymentMethod: payment,
      paymentStatus: "unpaid",
      period: period,
    };
    await NoodleSales.create(noodleOrder);
    await NoodleCart.deleteOne({ type, area, storeId });

    res.status(201).json({
      status: 201,
      message: "Insert Order success",
      data: noodleOrder,
    });
  } catch (error) {
    // await transaction.rollback()
    console.error(error);
    res.status(500).json({ status: "500", message: error.message });
  }
};
