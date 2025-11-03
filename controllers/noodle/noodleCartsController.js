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

      // หาว่ามีสินค้านี้อยู่ใน list แล้วหรือยัง (เทียบจาก sku, id, unit)
      const existingIndex = existNoodleCart.listProduct.findIndex(
        (item) => item.sku === sku && item.id === id && item.unit === unit
      );

      if (existingIndex !== -1) {
        // ✅ ถ้ามีอยู่แล้ว → บวก qty และ price ต่อ
        existNoodleCart.listProduct[existingIndex].qty += qty;
        existNoodleCart.listProduct[existingIndex].price += price;
      } else {
        // ✅ ถ้ายังไม่มี → เพิ่มใหม่
        existNoodleCart.listProduct.push({
          sku,
          id,
          qty,
          price,
          unit,
        });
      }

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

const productTimestamps = {}

exports.deleteProduct = async (req, res) => {
  // const session = await require('mongoose').startSession();
  // session.startTransaction();
  try {
    const { type, area, storeId, id, unit } = req.body
    const { NoodleCart } = getModelsByChannel(channel, res, noodleCartModel);
    const channel = req.headers['x-channel']

    const storeIdAndId = `${type}_${storeId}_${id}_${unit}`
    const now = Date.now()
    const lastUpdate = productTimestamps[storeIdAndId] || 0
    const ONE_MINUTE = 15 * 1000

    if (now - lastUpdate < ONE_MINUTE) {
      return res.status(429).json({
        status: 429,
        message: 'This order was updated less than 15 seconds ago. Please try again later!'
      })
    }
    productTimestamps[storeIdAndId] = now

    // console.log(productTimestamps)

    if (!type || !area || !id || !unit) {
      // await session.abortTransaction();
      // session.endSession();
      return res.status(400).json({
        status: 400,
        message: 'type, area, id, and unit are required!'
      })
    }

    if ((type === 'sale' || type === 'refund' || type === 'give') && !storeId) {
      // await session.abortTransaction();
      // session.endSession();
      return res.status(400).json({
        status: 400,
        message: 'storeId is required for sale or refund or give!'
      })
    }


    let cart = await NoodleCart.findOne(type, area, storeId)

    // console.log()

    if (!cart) {
      // await session.abortTransaction();
      // session.endSession();
      return res.status(404).json({ status: 404, message: 'Cart not found!' })
    }



    if (cart.listProduct.length === 0 && cart.listRefund.length === 0) {
      await Cart.deleteOne(cartQuery)
      // await session.commitTransaction();
      // session.endSession();
      return res.status(200).json({
        status: 200,
        message: 'Cart deleted successfully!'
      })
    }

    if (updated) {
      await cart.save()
    }

    // await session.commitTransaction();
    // session.endSession();

    const io = getSocket()
    io.emit('cart/delete', {})

    res.status(200).json({
      status: 200,
      message: 'Product removed successfully!',
      data: cart
    })
  } catch (error) {
    // await session.abortTransaction().catch(() => { });
    // session.endSession();
    console.error(error)
    res.status(500).json({ status: 500, message: error.message })
  }
}





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
