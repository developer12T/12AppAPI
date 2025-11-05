const express = require("express");

const { getModelsByChannel } = require("../../middleware/channel");
const userModel = require("../../models/cash/user");
const typetruck = require("../../models/cash/typetruck");
const noodleCartModel = require("../../models/foodtruck/noodleCart");
const productModel = require('../../models/cash/product')
const cartModel = require("../../models/cash/cart");
const {
  to2,
  getQty,
  updateStockMongo,
  getPeriodFromDate
} = require('../../middleware/order')



exports.addNoodleCart = async (req, res) => {
  try {
    const { type, area, storeId, sku, id, qty, unit } = req.body;
    const channel = req.headers["x-channel"];
    const { Product } = getModelsByChannel(channel, res, productModel);
    const { NoodleCart } = getModelsByChannel(channel, res, noodleCartModel);

    let data = null; // ✅ ประกาศก่อน

    const existNoodleCart = await NoodleCart.findOne({ type, area, storeId });

    const product = await Product.findOne({ id }).lean();
    if (!product) {
      return res.status(404).json({
        status: 404,
        message: "Product not found!",
      });
    }

    const unitData = product.listUnit.find((u) => u.unit === unit);
    if (!unitData) {
      return res.status(400).json({
        status: 400,
        message: `Unit '${unit}' not found for this product!`,
      });
    }

    const price = parseFloat(unitData.price["sale"]);

    if (existNoodleCart) {
      existNoodleCart.listProduct = existNoodleCart.listProduct || [];

      const existingIndex = existNoodleCart.listProduct.findIndex(
        (item) => item.sku === sku && item.id === id && item.unit === unit
      );

      if (existingIndex !== -1) {
        existNoodleCart.listProduct[existingIndex].qty += qty;
        // existNoodleCart.listProduct[existingIndex].price += price;
      } else {
        existNoodleCart.listProduct.push({
          sku,
          id,
          qty,
          price,
          unit,
        });
      }

      // ✅ คำนวณ total ใหม่ทุกครั้งหลังจากอัปเดต listProduct
      existNoodleCart.total = existNoodleCart.listProduct.reduce(
        (sum, p) => sum + p.qty * p.price,
        0
      );
      existNoodleCart.total = to2(existNoodleCart.total);
      // console.log(existNoodleCart.total);

      const savedCart = await existNoodleCart.save();
      data = savedCart;
    } else {
      data = {
        type,
        area,
        storeId,
        total: price * qty,
        listProduct: [
          {
            sku,
            id,
            qty,
            price,
            unit,
          },
        ],
      };

      const newCart = await NoodleCart.create(data);
      data = newCart;
    }


    // ✅ ส่ง data กลับใน response เสมอ
    res.status(200).json({
      status: 201,
      message: "Insert cart success",
      data: data,
    });
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({
      status: 500,
      message: "error from server",
      error: error.message || error.toString(),
      stack:
        process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};


const productTimestamps = {}

exports.deleteProductNoodle = async (req, res) => {
  // const session = await require('mongoose').startSession();
  // session.startTransaction();
  try {
    const channel = req.headers['x-channel']
    const { type, area, storeId, id, sku, unit } = req.body
    const { NoodleCart } = getModelsByChannel(channel, res, noodleCartModel);
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

    if (!type || !area || !id || !unit) {

      return res.status(400).json({
        status: 400,
        message: 'type, area, id, and unit are required!'
      })
    }

    if ((type === 'sale' || type === 'refund' || type === 'give') && !storeId) {
      return res.status(400).json({
        status: 400,
        message: 'storeId is required for sale or refund or give!'
      })
    }

    let cart = await NoodleCart.findOne({
      type: type,
      area: area,
      storeId: storeId
    })

    if (!cart) {

      return res.status(404).json({ status: 404, message: 'Cart not found!' })
    }

    const productIndex = cart.listProduct.findIndex(
      p => p.id === id && p.unit === unit && p.sku === sku
    )

    if (productIndex === -1) {

      return res
        .status(404)
        .json({ status: 404, message: 'Product not found in cart!' })
    }

    product = cart.listProduct[productIndex]
    cart.listProduct.splice(productIndex, 1)
    cart.total -= product.qty * product.price
    updated = true

    const period = getPeriodFromDate(cart.createdAt)

    // const updateResult = await updateStockMongo(
    //   product,
    //   area,
    //   period,
    //   'deleteCart',
    //   channel,
    //   res
    // )
    // if (updateResult) return



    if (cart.listProduct.length === 0) {
      await NoodleCart.deleteOne({ type: type, area: area, storeId: storeId })

      return res.status(200).json({
        status: 200,
        message: 'Cart deleted successfully!'
      })
    }

    if (updated) {
      await cart.save()
    }
    // const io = getSocket()
    // io.emit('cart/delete', {})

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

exports.getSoup = async (req, res) => {
  try {


    const channel = req.headers["x-channel"];
    const { Product } = getModelsByChannel(channel, res, productModel);
    const { Cart } = getModelsByChannel(channel, res, cartModel);


    const dataProduct = await Product.find({
      id: { $regex: 'ZNS' }
    }).sort({ id: 1 });

    const data = dataProduct.map(item => {

      const unit = item.listUnit.find(u => u.unit === 'PCS')

      return {
        id: item.id,
        name: item.name,
        nameBill: item.nameBill,
        price: unit.price.sale,
      }
    })




    res.status(200).json({
      status: 200,
      message: 'Fetch data success',
      data: data
    })

  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }

}