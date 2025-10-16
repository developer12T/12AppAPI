const express = require("express");

const { getModelsByChannel } = require("../../middleware/channel");
const userModel = require("../../models/cash/user");
const typetruck = require("../../models/cash/typetruck");
const noodleCartModel = require("../../models/foodtruck/noodleCart");
const cartModel = require("../../models/cash/cart");
const noodleSaleModel = require("../../models/foodtruck/noodleSale");


exports.checkout = async (req, res) => {
  // const transaction = await sequelize.transaction();
  try {
    const {
      type,
      area,
      storeId,
      routeId,
      period,
      note,
      latitude,
      longitude,
      shipping,
      payment,
      changePromotionStatus,
      listPromotion
    } = req.body

    const channel = req.headers['x-channel']
    const { NoodleSales } = getModelsByChannel(channel, res, noodleSaleModel)
    const { NoodleCart } = getModelsByChannel(channel, res, noodleCartModel);
    const { User } = getModelsByChannel(channel, res, userModel)
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Store, TypeStore } = getModelsByChannel(channel, res, storeModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Promotion, PromotionShelf, Quota } = getModelsByChannel(
      channel,
      res,
      promotionModel
    )

    if (!type || !area || !storeId || !payment) {
      return res
        .status(400)
        .json({ status: 400, message: 'Missing required fields!' })
    }

    const now = Date.now()
    const lastUpdate = orderTimestamps[storeId] || 0
    const ONE_MINUTE = 60 * 1000

    if (now - lastUpdate < ONE_MINUTE) {
      return res.status(429).json({
        status: 429,
        message:
          'This order was updated less than 1 minute ago. Please try again later!'
      })
    }
    orderTimestamps[storeId] = now

    const cart = await NoodleCart.findOne({ type, area, storeId })
    if (!cart || cart.listProduct.length === 0) {
      return res.status(404).json({ status: 404, message: 'NoodleCart is empty!' })
    }

  
  } catch (error) {
    // await transaction.rollback()
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}
