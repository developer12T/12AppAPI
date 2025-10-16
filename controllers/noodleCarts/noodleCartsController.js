const express = require("express");

const { getModelsByChannel } = require("../../middleware/channel");
const userModel = require("../../models/cash/user");
const typetruck = require("../../models/cash/typetruck");
const noodleCartModel = require("../../models/foodtruck/noodleCart");

exports.addNoodleCart = async (req, res) => {

  const {type, area, storeId, sku, id, qty, price, unit} = req.body

  const channel = req.headers["x-channel"];
  const { NoodleCart } = getModelsByChannel(channel, res, noodleCartModel);

  const data = {
    type:type,
    area:area,
    storeId:storeId,
    sku:sku,
    id:id,
    qty:qty,
    price:price,
    unit:unit
  }

  await NoodleCart.create(data)
  res.status(200).json({
    status:201,
    message:'Insert cart Sucess',
    data:data
  })

};
