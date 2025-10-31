const express = require("express");

const { getModelsByChannel } = require("../../middleware/channel");
const userModel = require("../../models/cash/user");
const typetruck = require("../../models/cash/typetruck");
const noodleCartModel = require("../../models/foodtruck/noodleCart");
const cartModel = require("../../models/cash/cart");
const noodleItemModel = require("../../models/foodtruck/noodleItem");


exports.addNoodleItem = async (req, res) => {
  try {
    const { type, id, name, nameTH, groupCode, price } = req.body;

    const channel = req.headers["x-channel"];

    const { NoodleItems } = getModelsByChannel(channel, res, noodleItemModel);

    const data = {
      type: type,
      id: id,
      name: name,
      nameTH: nameTH,
      groupCode: groupCode,
      price: price,
    };

    await NoodleItems.create(data);
    res.status(200).json({
      status: 201,
      message: "Insert item Sucess",
      data: data,
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

exports.getNoodleItem = async (req, res) => {
  try {
    const { type, area, storeId } = req.query;

    const channel = req.headers["x-channel"];

    const { NoodleItems } = getModelsByChannel(channel, res, noodleItemModel);
    const dataItem = await NoodleItems.find({ type: type })


    if (dataItem.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "Not found cart",
      });
    }

    res.status(200).json({
      status: 200,
      message: "Fecth data sucess",
      data: dataItem,
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
