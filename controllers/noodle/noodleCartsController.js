const express = require('express')

const { getModelsByChannel } = require('../../middleware/channel')
const userModel = require('../../models/cash/user')
const typetruck = require('../../models/cash/typetruck')
const noodleCartModel = require('../../models/foodtruck/noodleCart')
const productModel = require('../../models/cash/product')
const cartModel = require('../../models/cash/cart')
const NoodleItemsModel = require('../../models/foodtruck/noodleItem')
const noodleItemModel = require("../../models/foodtruck/noodleItem");
const {
  to2,
  getQty,
  updateStockMongo,
  getPeriodFromDate
} = require('../../middleware/order')

exports.addNoodleCart = async (req, res) => {
  try {
    const { type, area, storeId, typeProduct, id, sku, price, qty, unit, time, remark } = req.body;
    const channel = req.headers["x-channel"];

    const { Product } = getModelsByChannel(channel, res, productModel);
    const { NoodleCart } = getModelsByChannel(channel, res, noodleCartModel);
    const { NoodleItems } = getModelsByChannel(channel, res, noodleItemModel);

    let nameProduct = '';
    let data = {};

    if (typeProduct === 'noodle') {
      const [soupId, noodleId] = sku.split('_');
      const soupDetail = await Product.findOne({ id: soupId });
      const noodleDetail = await NoodleItems.findOne({ id: noodleId });

      if (!soupDetail || !noodleDetail) {
        return res.status(404).json({ status: 404, message: 'Not found this product' });
      }

      nameProduct = `${soupDetail.name}_${noodleDetail.name}`;
    } else if (typeProduct === 'pc') {
      const productDetail = await Product.findOne({ id: sku });
      if (!productDetail) {
        return res.status(404).json({ status: 404, message: 'Not found this product' });
      }

      nameProduct = `${productDetail.name}`;
    }

    const product = await Product.findOne({ id }).lean();
    if (!product) {
      return res.status(404).json({ status: 404, message: "Product not found!" });
    }

    const unitData = product.listUnit.find((u) => u.unit === unit);
    if (!unitData) {
      return res.status(400).json({
        status: 400,
        message: `Unit '${unit}' not found for this product!`,
      });
    }

    const existNoodleCart = await NoodleCart.findOne({ type, area, storeId });

    if (existNoodleCart) {
      existNoodleCart.listProduct = existNoodleCart.listProduct || [];

      const existingIndex = existNoodleCart.listProduct.findIndex(
        (item) => item.sku === sku && item.id === id && item.unit === unit
      );

      if (existingIndex !== -1) {
        const item = existNoodleCart.listProduct[existingIndex];
        item.qty += qty;
        item.totalPrice += qty * price;
        item.time = time;
        item.remark = remark;
      } else {

        existNoodleCart.listProduct.push({
          type: typeProduct,
          id,
          sku,
          name: nameProduct,
          qty,
          price: price,
          totalPrice: price * qty,
          unit,
          time,
          remark,
        });
      }


      existNoodleCart.total = to2(
        existNoodleCart.listProduct.reduce((sum, p) => sum + p.qty * p.price, 0)
      );

      data = existNoodleCart; 
    } else {

      data = new NoodleCart({
        type,
        area,
        storeId,
        total: price * qty,
        listProduct: [
          {
            type: typeProduct,
            id,
            sku,
            name: nameProduct,
            qty,
            price: price,
            totalPrice: price * qty,
            unit,
            time,
            remark,
          },
        ],
      });
    }

    const period = getPeriodFromDate(data.createdAt || new Date());
    const qtyProduct = { id, qty, unit };

    if (type === 'saleNoodle') {
      const updateResult = await updateStockMongo(
        qtyProduct,
        area,
        period,
        'addproduct',
        channel,
        'OUT',
        res
      );
      if (updateResult) return;
    }

    const savedCart = await data.save();


    res.status(201).json({
      status: 201,
      message: "Insert / Update cart success",
      data: savedCart,
    });

  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({
      status: 500,
      message: "Error from server",
      error: error.message || error.toString(),
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
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
    const { NoodleCart } = getModelsByChannel(channel, res, noodleCartModel)
    const storeIdAndId = `${type}_${id}_${unit}`
    const now = Date.now()
    const lastUpdate = productTimestamps[storeIdAndId] || 0
    const ONE_MINUTE = 15 * 1000

    if (now - lastUpdate < ONE_MINUTE) {
      return res.status(429).json({
        status: 429,
        message:
          'This order was updated less than 15 seconds ago. Please try again later!'
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

    const updateResult = await updateStockMongo(
      product,
      area,
      period,
      'deleteCart',
      channel,
      res
    )
    if (updateResult) return

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
    const { type, area, storeId } = req.query

    const channel = req.headers['x-channel']
    const { NoodleCart } = getModelsByChannel(channel, res, noodleCartModel)
    const { Cart } = getModelsByChannel(channel, res, cartModel)

    const query = {
      area: area,
      ...(storeId ? { storeId } : {})
    }

    let dataCart = {}
    if (['sale', 'refund', 'withdraw', 'give'].includes(type)) {
      dataCart = await Cart.findOne(query)
    } else if (['saleNoodle'].includes(type)) {
      dataCart = await NoodleCart.findOne(query)
    }

    if (!dataCart) {
      return res.status(404).json({
        status: 404,
        message: 'Not found cart'
      })
    }

    res.status(200).json({
      status: 200,
      message: 'Fecth data sucess',
      data: dataCart
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

exports.getSoup = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Cart } = getModelsByChannel(channel, res, cartModel)

    const dataProduct = await Product.find({
      id: { $regex: 'ZNS' }
    }).sort({ id: 1 })

    const data = dataProduct.map(item => {
      const unit = item.listUnit.find(u => u.unit === 'PCS')

      return {
        id: item.id,
        name: item.name,
        nameBill: item.nameBill,
        price: unit.price.sale
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

