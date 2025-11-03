const express = require("express");

const { getModelsByChannel } = require("../../middleware/channel");
const userModel = require("../../models/cash/user");
const typetruck = require("../../models/cash/typetruck");
const noodleCartModel = require("../../models/foodtruck/noodleCart");
const cartModel = require("../../models/cash/cart");
exports.addNoodleCart = async (req, res) => {
  try {
    const { type, area, storeId, sku, id, qty, price, unit } = req.body;

    const channel = req.headers["x-channel"];

    const { NoodleCart } = getModelsByChannel(channel, res, noodleCartModel);

    const existNoodleCart = await NoodleCart.findOne({
  type,
  area,
  storeId
})


if (existNoodleCart) {
  existNoodleCart.listProduct = existNoodleCart.listProduct || [];
  existNoodleCart.listProduct.push({
    sku,
    id,
    qty,
    price,
    unit
  });
  await existNoodleCart.save();
} else {
  const data = {
    type,
    area,
    storeId,
    listProduct: [
      {
        sku,
        id,
        qty,
        price,
        unit
      }
    ]
  };

  await NoodleCart.create(data);
}


    res.status(200).json({
      status: 201,
      message: "Insert cart Sucess",
      // data: data,
    });
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }

};

exports.getCartDetailNew = async (req, res) => {
  try {
    const { type, area, storeId } = req.query;

    const channel = req.headers["x-channel"];
    const { NoodleCart } = getModelsByChannel(channel, res, noodleCartModel);
    const { Cart } = getModelsByChannel(channel, res, cartModel);

    const query = {
      area: area,
      ...(storeId ? { storeId } : {}),
    };

    let dataCart = [];
    if (["sale", "refund", "withdraw", "give"].includes(type)) {
      dataCart = await Cart.find(query);
    } else if (["saleNoodle"].includes(type)) {
      dataCart = await NoodleCart.find(query);
    }

    if (dataCart.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "Not found cart",
      });
    }

    res.status(200).json({
      status: 200,
      message: "Fecth data sucess",
      data: dataCart,
    });
  } catch (error) {

    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })

  }

};
