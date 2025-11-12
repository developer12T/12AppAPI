const express = require("express");

const { getModelsByChannel } = require("../../middleware/channel");
const userModel = require("../../models/cash/user");
const typetruck = require("../../models/cash/typetruck");
const noodleCartModel = require("../../models/foodtruck/noodleCart");
const cartModel = require("../../models/cash/cart");
const noodleSaleModel = require("../../models/foodtruck/noodleSale");
const orderModel = require('../../models/cash/sale')
const noodleItemModel = require("../../models/foodtruck/noodleItem");
const { generateOrderIdFoodTruck } = require("../../utilities/genetateId");
const {
  to2,
  getQty,
  updateStockMongo,
  getPeriodFromDate
} = require('../../middleware/order')
const productModel = require('../../models/cash/product');
const { before, range } = require("lodash");
const orderTimestamps = {};

exports.checkout = async (req, res) => {
  // const transaction = await sequelize.transaction();
  try {
    const { type, area, storeId, period, payment } = req.body;

    const channel = req.headers["x-channel"];
    const { Order } = getModelsByChannel(channel, res, orderModel)
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
    // console.log(area,sale.warehouse)
    const orderId = await generateOrderIdFoodTruck(area, sale.warehouse, channel, res);

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
        type: item.type || '',
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
        subtotal: parseFloat(item.totalPrice.toFixed(2)) || 0,
        discount: 0,
        netTotal: parseFloat(item.totalPrice.toFixed(2)) || 0,
        time: item.time,
        remark: item.remark,
      };
    });

    if (listProduct.includes(null)) return;

    const start = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - 1, // ✅ ลบ 1 วัน เพราะไทยเร็วกว่า UTC 7 ชั่วโมง
      17, 0, 0               // 17 UTC = 00:00 ไทย
    ));

    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);

    const exitOrder = await Order.findOne({
      'store.area': area,
      status: { $in: ['pending', 'paid'] },
      createdAt: { $gte: start, $lte: end }
    }).sort({ createdAt: -1 }).select('number waiting')

    const maxOrder = await Order.findOne({ 'store.area': area })
      .sort({ number: -1 }) // เรียงจากมากไปน้อย
      .select('number');    // ดึงเฉพาะ field number (จะเร็วขึ้น)

    const maxNumber = maxOrder ? maxOrder.number : 0; // ถ้าไม่เจอให้เป็น 0

    let number = 0
    let waiting = 0


    if (exitOrder) {
      number = maxNumber + 1 || 1
      waiting = exitOrder.waiting + 1
    } else {
      number = maxNumber + 1 || 1
      waiting = 0
    }

    // console.log('maxNumber.number',maxNumber)

    const noodleOrder = {
      orderId,
      routeId: "",
      type: "saleNoodle",
      number: number,
      waiting: waiting,
      status: "pending",
      statusTH: "รอชำระ",
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


    const qtyproduct = noodleOrder.listProduct
      .filter(u => u?.id && u?.unit && u?.qty > 0)
      .map(u => ({
        id: u.id,
        unit: u.unit,
        qty: u.qty,
        statusMovement: 'OUT'
      }))


    for (const item of qtyproduct) {
      const updateResult = await updateStockMongo(
        item,
        area,
        period,
        'sale',
        channel,
        res
      )
      if (updateResult) return
    }




    await Order.create(noodleOrder);
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
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { orderId, status } = req.body

    let statusStrTH = ''
    let orderUpdated = {}

    const orderDetail = await Order.findOne({ orderId: orderId, status: { $in: ['paid', 'pending'] } })

    if (!orderDetail) {
      return res.status(404).json({
        status: 400,
        message: 'Not found Order or status is success'
      })
    }
    const area = orderDetail.store.area

    switch (status) {
      case 'paid':
        statusStrTH = 'จ่ายเงินแล้ว'
        orderUpdated = await Order.findOneAndUpdate(
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
      case 'success':

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
        orderUpdated = await Order.findOneAndUpdate(
          { orderId },
          {
            $set: {
              status,
              statusTH: statusStrTH
            }
          },
          { new: true }
        );
        const dataOrder = await Order.find({
          'store.area': area,
          status: { $in: ['paid', 'pending'] },
          createdAt: { $gte: start, $lte: end }
        }).sort({ number: 1 }).select('number orderId');

        // console.log(dataOrder)
        let count = 0;

        for (const order of dataOrder) {

          await Order.updateMany(
            {
              orderId: order.orderId
            },
            {
              $set: { waiting: count } // ✅ ไม่ต้องอยู่ใน $set
            }
          );
          count++;
        }

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
    const { Order } = getModelsByChannel(channel, res, orderModel)
    if (!orderId) {
      return res
        .status(400)
        .json({ status: 400, message: "Missing required fields!" });
    }

    const foodTruckData = await Order.find({ orderId: orderId })

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

exports.updatePickUp = async (req, res) => {
  try {

    const { pickUp, orderId } = req.body

    if (!pickUp) {
      return res.status(404).json({
        message: 'Not found pickUp status'
      })
    }
    const channel = req.headers["x-channel"];
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { NoodleSales } = getModelsByChannel(channel, res, noodleSaleModel);
    const { NoodleCart } = getModelsByChannel(channel, res, noodleCartModel);
    const { NoodleItems } = getModelsByChannel(channel, res, noodleItemModel);

    const existOrder = await Order.find({ orderId: orderId })

    if (!existOrder) {
      return res.status(404).json({
        message: 'Not found orderId'
      })
    }

    const data = await Order.findOneAndUpdate(
      { orderId: orderId },
      {
        $set: {
          pickUp: pickUp
        }
      },
      { new: true }
    )

    res.status(201).json({
      status: 201,
      message: 'Update pickup sucess',
      data: data
    })

  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "500", message: error.message });
  }
}


exports.updateQrPayment = async (req, res) => {
  try {
    const { value, orderId } = req.body
    const channel = req.headers["x-channel"];
    const { Order } = getModelsByChannel(channel, res, orderModel)

    const existOrder = await Order.find({ orderId: orderId })

    if (!existOrder) {
      res.status(404).json({
        status: 404,
        message: 'Not found Order'
      })
    }

    const order = await Order.findOne({
      orderId: orderId,
      $expr: {
        $and: [
          { $gte: [{ $add: ["$qr", +value] }, 0] },
          { $gte: [{ $add: ["$total", -value] }, 0] }
        ]
      }
    })

    if (!order) {
      return res.status(400).json({
        status: 400,
        message: 'Cannot update: negative value or order not found.'
      })
    }

    const dataUpdate = await Order.findOneAndUpdate(
      { orderId: orderId },
      {
        $inc: {
          qr: +value,
          total: -value
        }
      },
      { new: true }
    )

    res.status(201).json({
      status: 201,
      message: 'update payment qr success',
      data: dataUpdate
    })


  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "500", message: error.message });
  }
}

exports.getOrderPcToExcel = async (req, res) => {
  try {
    const { channel } = req.query
    let { startDate, endDate } = req.query
    const { area, team, zone } = req.query

    // console.log(channel, date)
    let statusArray = (req.query.status || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    if (statusArray.length === 0) {
      statusArray = ['pending'] // default
    }

    const { Order } = getModelsByChannel(channel, res, orderModel)

    if (!/^\d{8}$/.test(startDate)) {
      const nowTH = new Date(
        new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
      )
      const y = nowTH.getFullYear()
      const m = String(nowTH.getMonth() + 1).padStart(2, '0')
      const d = String(nowTH.getDate()).padStart(2, '0') // ← ใช้ getDate() ไม่ใช่ getDay()
      startDate = `${y}${m}${d}` // YYYYMMDD
      endDate = `${y}${m}${d}` // YYYYMMDD
    }
    const startTH = new Date(
      `${startDate.slice(0, 4)}-${startDate.slice(4, 6)}-${startDate.slice(
        6,
        8
      )}T00:00:00+07:00`
    )
    const endTH = new Date(
      `${endDate.slice(0, 4)}-${endDate.slice(4, 6)}-${endDate.slice(
        6,
        8
      )}T23:59:59.999+07:00`
    )

    let query = {
      createdAt: {
        $gte: startTH,
        $lte: endTH
      },
      status: { $nin: ['canceled'] },
      status: { $in: statusArray },
      type: { $in: ['saleNoodle'] },
      // 'store.area': { $ne: 'IT211' }
    }

    if (area) {
      query['store.area'] = area
      queryChange['store.area'] = area
      queryRefund['store.area'] = area
    } else if (zone) {
      query['store.area'] = { $regex: `^${zone}`, $options: 'i' }
      queryChange['store.area'] = { $regex: `^${zone}`, $options: 'i' }
      queryRefund['store.area'] = { $regex: `^${zone}`, $options: 'i' }
    }

    const pipeline = [
      {
        $match: query
      },
      {
        $addFields: {
          createdAtThai: {
            $dateAdd: {
              startDate: '$createdAt',
              unit: 'hour',
              amount: 7
            }
          },
          team3: {
            $concat: [
              { $substrCP: ['$store.area', 0, 2] },
              { $substrCP: ['$store.area', 3, 1] }
            ]
          }
        }
      }
    ]
    if (team) {
      pipeline.push({
        $match: {
          team3: { $regex: `^${team}`, $options: 'i' }
        }
      })
    }

    pipeline.push({
      $sort: { statusASC: 1, createdAt: -1 }
    })

    const modelOrder = await Order.aggregate(pipeline)

    const tranFromOrder = modelOrder.flatMap(order => {
      let counterOrder = 0
      function formatDateToThaiYYYYMMDD(date) {
        const d = new Date(date)
        d.setHours(d.getHours() + 7) // บวก 7 ชั่วโมงให้เป็นเวลาไทย (UTC+7)

        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')

        return `${yyyy}${mm}${dd}`
      }
      // console.log(order.createdAtThai)
      // ใช้งาน
      const RLDT = formatDateToThaiYYYYMMDD(order.createdAt)

      const listProduct = order.listProduct.map(product => {
        return {
          proCode: '',
          id: product.id,
          name: product.name,
          group: product.group,
          brand: product.brand,
          size: product.size,
          flavour: product.flavour,
          qty: product.qty,
          unit: product.unit,
          unitName: product.unitName,
          price: product.price,
          subtotal: product.subtotal,
          discount: product.discount,
          netTotal: product.netTotal
        }
      })

      const listPromotion = order.listPromotions.map(promo =>
        promo.listProduct.map(product => {
          return {
            proCode: promo.proCode,
            id: product.id,
            name: product.name,
            group: product.group,
            brand: product.brand,
            size: product.size,
            flavour: product.flavour,
            qty: product.qty,
            unit: product.unit,
            unitName: product.unitName,
            qtyPcs: product.qtyPcs
          }
        })
      )

      const productIDS = [...listProduct, ...listPromotion].flat()

      // console.log("productIDS",productIDS)
      return productIDS.map(product => {
        counterOrder++

        // const promoCount = 0; // สามารถเปลี่ยนเป็นตัวเลขอื่นเพื่อทดสอบ

        return {
          // AREA: order.store.area,
          CUNO: order.sale.salePayer,
          FACI: 'F10',
          WHLO: order.sale.warehouse,
          ORNO: '',
          OAORTP: 'A51',
          RLDT: RLDT,
          ADID: '',
          CUOR: order.orderId,
          OAOREF: '',
          OBITNO: product.id,
          OBBANO: '',
          OBALUN: product.unit,
          OBORQA: `${product.qty}`,
          OBSAPR: `${product.price || 0}`,
          OBSPUN: product.unit,
          OBWHSL: '',
          ROUT: '',
          OBPONR: `${counterOrder}`,
          OBDIA2: `${product.discount || 0}`,
          OBRSCD: '',
          OBCMNO: '',
          OBPIDE: product.proCode,
          OBSMCD: order.sale.saleCode,
          OAORDT: RLDT,
          OAODAM: '0',
          OECRID: '',
          OECRAM: '',
          OECRID2: '',
          OECRAM2: '',
          OECRID3: '',
          OECRAM3: '',
          OECRID4: '',
          OECRAM4: '',
          OECRID5: '',
          OECRAM5: '',
          OARESP: '',
          OAYREF: '',
          OATEL2: '',
          OAWCON: '',
          OAFRE1: '',
          OATXAP: '',
          OATXAP2: '',
          OBDIA1: '',
          OBDIA3: '',
          OBDIA4: ''
        }
      })
    })


    res.status(200).json({
      status: 200,
      message: 'fetch data Success',
      data: tranFromOrder
    })




  } catch (error) {
    console.error('❌ updateUserSaleInOrder error:', error)
    return res.status(500).json({
      status: 500,
      message: 'Server error',
      error: error.message
    })
  }
}