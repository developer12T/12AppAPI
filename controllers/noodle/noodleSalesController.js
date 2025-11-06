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
const productModel = require('../../models/cash/product');
const { before } = require("lodash");
const orderTimestamps = {};

exports.checkout = async (req, res) => {
  // const transaction = await sequelize.transaction();
  try {
    const { type, area, storeId, period, payment } = req.body;

    const channel = req.headers["x-channel"];
    const { NoodleSales } = getModelsByChannel(channel, res, noodleSaleModel);
    const { NoodleCart } = getModelsByChannel(channel, res, noodleCartModel);
    const { NoodleItems } = getModelsByChannel(channel, res, noodleItemModel);
    const { User } = getModelsByChannel(channel, res, userModel);
    const { Product } = getModelsByChannel(channel, res, productModel);

    if (!type || !area || !storeId || !payment) {
      return res
        .status(400)
        .json({ status: 400, message: "Missing required fields!" });
    }

    const now = new Date();
    const lastUpdate = orderTimestamps[storeId] || 0;
    const ONE_MINUTE = 60 * 1000;

    // if (now - lastUpdate < ONE_MINUTE) {
    //   return res.status(429).json({
    //     status: 429,
    //     message:
    //       "This order was updated less than 1 minute ago. Please try again later!",
    //   });
    // }

    orderTimestamps[storeId] = now;

    const cart = await NoodleCart.findOne({ type, area, storeId });
    if (!cart || cart.length === 0) {
      return res
        .status(404)
        .json({ status: 404, message: "NoodleCart is empty!" });
    }

    const sale = (await User.findOne({ area: area })) ?? {};
    // console.log(sale)
    const orderId = await generateOrderIdFoodTruck(area,sale.warehouse, channel, res);

    const total = to2(cart.total); // ราคารวมภาษี เช่น 45
    const totalExVat = to2(total / 1.07); // แยกภาษีออก

    const productIds = cart.listProduct.map(p => p.id);
    const products = await Product.find({ id: { $in: productIds } }).select(
      "id name groupCode group brandCode brand size flavourCode flavour listUnit"
    );

    let subtotal = 0;
    let listProduct = cart.listProduct.map(item => {
      const product = products.find(p => p.id === item.id);
      if (!product) return null;

      const unitData = product.listUnit.find(u => u.unit === item.unit);
      if (!unitData) {
        return res.status(400).json({
          status: 400,
          message: `Invalid unit for product ${item.id}`
        });
      }

      const totalPrice = item.qty * unitData.price.sale;
      subtotal += totalPrice;

      return {
        type:item.type || '',
        id: product.id || '',
        sku: item.sku || '',
        name: item.name || '',
        group: product.group || '',
        groupCode: product.groupCode || '',
        brandCode: product.brandCode || '',
        brand: product.brand || '',
        size: product.size || '',
        flavourCode: product.flavourCode || '',
        flavour: product.flavour || '',
        qty: item.qty || '',
        unit: item.unit || '',
        unitName: unitData.name || '',
        price: item.price || 0,
        unitPrice: item.unitPrice || 0,
        subtotal: parseFloat(totalPrice.toFixed(2)) || 0,
        discount: 0,
        netTotal: parseFloat(totalPrice.toFixed(2)) || 0,
        time:item.time,
        remark:item.remark,
      };
    });

    if (listProduct.includes(null)) return;

    // เวลาไทย = UTC + 7 ชั่วโมง
    const thailand = new Date(now.getTime() + 7 * 60 * 60 * 1000);

    const start = new Date(Date.UTC(
      thailand.getFullYear(),
      thailand.getMonth(),
      thailand.getDate(),
      -7, 0, 0 // ⬅️ = UTC ของเวลา 00:00 ไทย
    ));

    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)

    const exitOrder = await NoodleSales.findOne({
      'store.area': area,
      status: { $in: ['pending', 'paid'] },
      createdAt: { $gte: start, $lte: end }
    }).sort({ createdAt: -1 }).select('number waiting')

    let number = 0
    let waiting = 0

    if (exitOrder) {
      number = exitOrder.number + 1
      waiting = exitOrder.waiting + 1
    } else {
      number = 1
      waiting = 0
    }

    const noodleOrder = {
      orderId,
      routeId: "",
      type: "saleNoodle",
      number: number,
      waiting: waiting,
      status: "pending",
      statusTH: "รอนำเข้า",
      sale: {
        saleCode: sale.saleCode || "",
        salePayer: sale.salePayer || "",
        name: `${sale.firstName} ${sale.surName}` || "",
        tel: sale.tel || "",
        warehouse: sale.warehouse || ""
      },
      store: {
        storeId: "",
        name: "",
        address: "",
        taxId: "",
        tel: "",
        area: sale.area || "",
        zone: sale.zone || ""
      },
      shipping: {
        default: '',
        shippingId: "",
        address: "",
        district: "",
        subDistrict: "",
        province: "",
        postCode: "",
        latitude: "",
        longtitude: ""
      },
      note: "",
      latitude: "",
      longitude: "",
      listProduct,
      listPromotions: [],
      // listQuota: summary.listQuota,
      subtotal,
      discount: 0,
      listQuota: [],
      discountProductId: [],
      discountProduct: 0,
      vat: parseFloat((total - total / 1.07).toFixed(2)),
      totalExVat: parseFloat((total / 1.07).toFixed(2)),
      total: total,
      paymentMethod: payment,
      paymentStatus: "unpaid",
      createdBy: sale.username,
      period: period
    };

    await NoodleSales.create(noodleOrder);
    await NoodleCart.deleteOne({ type, area, storeId });

    res.status(201).json({
      status: 201,
      message: "Insert Order success",
      data: noodleOrder
    });
  } catch (error) {
    // await transaction.rollback()
    console.error(error);
    res.status(500).json({ status: "500", message: error.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {

    const channel = req.headers["x-channel"];
    const { NoodleSales } = getModelsByChannel(channel, res, noodleSaleModel);
    const { NoodleCart } = getModelsByChannel(channel, res, noodleCartModel);
    const { NoodleItems } = getModelsByChannel(channel, res, noodleItemModel);

    const { orderId, status } = req.body

    let statusStrTH = ''
    let orderUpdated = {}
  
    const orderDetail = await NoodleSales.findOne({ orderId: orderId ,status:{$in: ['paid', 'pending']}})

    if (!orderDetail) {
      return res.status(404).json({
        status: 400,
        message: 'Not found Order'
      })
    }
    const area = orderDetail.store.area

    switch (status) {
      case 'paid':
        statusStrTH = 'จ่ายเงินแล้ว'
        orderUpdated = await NoodleSales.findOneAndUpdate(
          { orderId },
          {
            $set: {
              status,
              statusTH: statusStrTH
            }
          },
          { new: true }
        );
        break
      case 'sucess':

        const now = new Date();
        const thailand = new Date(now.getTime() + 7 * 60 * 60 * 1000);

        const start = new Date(Date.UTC(
          thailand.getFullYear(),
          thailand.getMonth(),
          thailand.getDate(),
          -7, 0, 0 // ⬅️ = UTC ของเวลา 00:00 ไทย
        ));

        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)


        statusStrTH = 'สำเร็จแล้ว'
        orderUpdated = await NoodleSales.findOneAndUpdate(
          { orderId },
          {
            $set: {
              status,
              statusTH: statusStrTH
            }
          },
          { new: true }
        );

        await NoodleSales.updateMany(
          {
            'store.area': area,
            status: { $in: ['paid', 'pending'] },
            createdAt: { $gte: start, $lte: end }
          },
          {
            $inc: { waiting: -1 } // ✅ ไม่ต้องอยู่ใน $set
          }
        );

        break
      default:
        return res.status(404).json({
          status: 400,
          message: 'Not found status'
        })
    }

    res.status(201).json({
      status: 201,
      message: 'Update Sucess',
      data: orderUpdated
    }
    )


  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "500", message: error.message });
  }
}





exports.orderIdDetailFoodtruck = async (req, res) => {
  try {

    const { orderId } = req.query;

    const channel = req.headers["x-channel"];
    const { NoodleSales } = getModelsByChannel(channel, res, noodleSaleModel);
    const { NoodleCart } = getModelsByChannel(channel, res, noodleCartModel);
    const { NoodleItems } = getModelsByChannel(channel, res, noodleItemModel);

    if (!orderId) {
      return res
        .status(400)
        .json({ status: 400, message: "Missing required fields!" });
    }

    const foodTruckData = await NoodleSales.find({ orderId: orderId })

    const data = foodTruckData.map(item => {

      return {
        orderId: item.orderId || '',
        routeId: item.routeId || '',
        type: item.type || '',
        status: item.status || '',
        statusTH: item.statusTH || '',

        sale: {
          saleCode: item.saleCode || '',
          salePayer: item.salePayer || '',
          name: item.name || '',
          tel: item.tel || '',
          warehouse: item.warehouse || ''
        },

        store: {
          storeId: item.storeId || '',
          name: item.name || '',
          address: item.address || '',
          taxId: item.taxId || '',
          tel: item.tel || '',
          area: item.area || '',
          zone: item.zone || ''
        },
        shipping: {
          shippingId: item.shippingId || '',
          address: item.address || '',
          district: item.district || '',
          subDistrict: item.subDistrict || '',
          province: item.province || '',
          postCode: item.postCode || '',
          latitude: item.latitude || '',
          longtitude: item.longtitude || '',
        },
        item: item.note || '',
        latitude: item.latitude || '',
        longitude: item.longitude || '',
        listProduct: item.listProduct.map(product => {

          return {
            id: product.id || '',
            sku: product.sku || '',
            name: product.name || '',
            groupCode: product.groupCode || '',
            group: product.group || '',
            brandCode: product.brandCode || '',
            brand: product.brand || '',
            size: product.size || '',
            flavourCode: product.flavourCode || '',
            flavour: product.flavour || '',
            qty: product.qty || 0,
            unit: product.unit || '',
            unitName: product.unitName || '',
            price: product.price || 0,
            subtotal: product.subtotal || 0,
            discount: product.discount || 0,
            netTotal: product.netTotal || 0
          }
        }),
        listPromotions: item.listPromotions || [],

        subtotal: item.subtotal || 0,
        discount: item.discount || 0,
        discountProductId: [],
        discountProduct: 0,
        vat: item.vat || 0,
        totalExVat: item.totalExVat || 0,
        total: item.total || 0,
        qr: item.qr || 0,

        paymentMethod: item.paymentMethod || '',
        paymentStatus: item.paymentStatus || '',
        createdBy: item.createdBy || '',
        period: item.period || '',
        listImage: [],
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }

    })



    res.status(200).json({
      status: 200,
      message: 'Fetch data sucess',
      data: data
    })



  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "500", message: error.message });
  }
}