// const { Order } = require('../../models/cash/sale')
// const { Cart } = require('../../models/cash/cart')
// const { User } = require('../../models/cash/user')
// const { Product } = require('../../models/cash/product')
// const { Route } = require('../../models/cash/route')


const { Warehouse, Locate, Balance, Sale } = require('../../models/cash/master')
const { generateOrderId } = require('../../utilities/genetateId')
const {
  summaryOrder,
  summaryOrderProStatusOne
} = require('../../utilities/summary')
const { fn, col } = require('sequelize')
const { sequelize, DataTypes } = require('../../config/m3db')
const { rangeDate } = require('../../utilities/datetime')
const { uploadFiles } = require('../../utilities/upload')
const { checkInRoute } = require('../route/checkIn')
const multer = require('multer')
const upload = multer({ storage: multer.memoryStorage() }).single('image')
const _ = require('lodash')
const { DateTime } = require("luxon");
const { getSocket } = require('../../socket')
const { applyPromotion } = require('../promotion/calculate')
const stockModel = require('../../models/cash/stock')
const orderModel = require('../../models/cash/sale')
const cartModel = require('../../models/cash/cart')
const userModel = require('../../models/cash/user')
const productModel = require('../../models/cash/product')
const routeModel = require('../../models/cash/route')
const promotionModel = require('../../models/cash/promotion')


const storeModel = require('../../models/cash/store');
const { getModelsByChannel } = require('../../middleware/channel')

const xlsx = require('xlsx');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { group } = require('console')





exports.checkout = async (req, res) => {
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
      listPromotion = []
    } = req.body

    const channel = req.headers['x-channel'];

    const { Cart } = getModelsByChannel(channel, res, cartModel);
    const { User } = getModelsByChannel(channel, res, userModel);
    const { Product } = getModelsByChannel(channel, res, productModel);
    const { Order } = getModelsByChannel(channel, res, orderModel);
    const { Stock, StockMovementLog, StockMovement } = getModelsByChannel(channel, res, stockModel);


    if (!type || !area || !storeId || !shipping || !payment) {
      return res
        .status(400)
        .json({ status: 400, message: 'Missing required fields!' })
    }

    const cart = await Cart.findOne({ type, area, storeId })
    if (!cart || cart.listProduct.length === 0) {
      return res.status(404).json({ status: 404, message: 'Cart is empty!' })
    }
    const sale = await User.findOne({ area }).select(
      'firstName surName warehouse tel saleCode salePayer'
    )
    if (!sale) {
      return res
        .status(404)
        .json({ status: 404, message: 'Sale user not found!' })
    }

    let summary = ''
    let data = ''
    if (changePromotionStatus == 0) {
      summary = await summaryOrder(cart, channel, res)
      // data = applyPromotion(summary,channel,res)
    } else if (changePromotionStatus == 1) {
      summary = await summaryOrderProStatusOne(cart, listPromotion, channel, res)
      // data = applyPromotion(summary,channel,res)
    }
    // const shippingData = store.shippingAddress.find(s => s.shippingId === shipping)
    // if (!shippingData) {
    //     return res.status(404).json({ status: 404, message: 'Shipping address not found!' })
    // }

    const productIds = cart.listProduct.map(p => p.id)
    const products = await Product.find({ id: { $in: productIds } }).select(
      'id name groupCode group brandCode brand size flavourCode flavour listUnit'
    )

    let subtotal = 0
    let listProduct = cart.listProduct.map(item => {
      const product = products.find(p => p.id === item.id)
      if (!product) return null

      const unitData = product.listUnit.find(u => u.unit === item.unit)
      if (!unitData) {
        return res
          .status(400)
          .json({
            status: 400,
            message: `Invalid unit for product ${item.id}`
          })
      }

      const totalPrice = item.qty * unitData.price.sale
      subtotal += totalPrice

      return {
        id: product.id,
        lot: item.lot,
        name: product.name,
        group: product.group,
        groupCode: product.groupCode,
        brandCode: product.brandCode,
        brand: product.brand,
        size: product.size,
        flavourCode: product.flavourCode,
        flavour: product.flavour,
        qty: item.qty,
        unit: item.unit,
        unitName: unitData.name,
        price: unitData.price.sale,
        subtotal: parseFloat(totalPrice.toFixed(2)),
        discount: 0,
        netTotal: parseFloat(totalPrice.toFixed(2))
      }
    })
    if (listProduct.includes(null)) return
    const orderId = await generateOrderId(area, sale.warehouse, channel, res)

    const newOrder = new Order({
      orderId,
      type,
      status: 'pending',
      sale: {
        saleCode: sale.saleCode,
        salePayer: sale.salePayer,
        name: `${sale.firstName} ${sale.surName}`,
        tel: sale.tel || '',
        warehouse: sale.warehouse
      },
      store: {
        storeId: summary.store.storeId,
        name: summary.store.name,
        type: summary.store.type,
        address: summary.store.address,
        taxId: summary.store.taxId,
        tel: summary.store.tel,
        area: summary.store.area,
        zone: summary.store.zone
      },
      note,
      latitude,
      longitude,
      listProduct,
      listPromotions: summary.listPromotion,
      subtotal,
      discount: 0,
      discountProduct: 0,
      vat: parseFloat((subtotal - (subtotal / 1.07)).toFixed(2)),
      totalExVat: parseFloat((subtotal / 1.07).toFixed(2)),
      total: subtotal,
      // shipping: {
      //     shippingId: shippingData.shippingId,
      //     address: shippingData.address,
      //     dateRequest: shipping.dateRequest,
      //     note: shipping.note
      // },
      shipping: {
        shippingId: '',
        address: ''
      },
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      createdBy: sale.username
    })

    // console.log(JSON.stringify(newOrder.listProduct, null, 2));

    // const calStock = {
    //     // storeId: refundOrder.store.storeId,
    //     area: newOrder.store.area,
    //     period: period,
    //     type: "Sale",
    //     listProduct: newOrder.listProduct.map(u => {
    //         return {
    //             id: u.id,
    //             lot: u.lot,
    //             unit: u.unit,
    //             qty: u.qty,
    //         }
    //     })
    // }
    const calStock = {
      // storeId: refundOrder.store.storeId,
      orderId: newOrder.orderId,
      area: newOrder.store.area,
      saleCode: sale.saleCode,
      period: period,
      warehouse: newOrder.sale.warehouse,
      status: 'pending',
      action: "Sale",
      type: "Sale",
      product: newOrder.listProduct.map(u => {
        return {
          productId: u.id,
          lot: u.lot,
          unit: u.unit,
          qty: u.qty,
        }
      })
    }
    // console.log("calStock",calStock)
    const productId = calStock.product.flatMap(u => u.productId)

    const stock = await Stock.aggregate([
      { $match: { area: area, period: period } },
      { $unwind: { path: '$listProduct', preserveNullAndEmptyArrays: true } },
      { $match: { "listProduct.productId": { $in: productId } } },
      // { $match : { "listProduct.available.lot": u.lot } },
      {
        $project: {
          _id: 0,
          productId: "$listProduct.productId",
          sumQtyPcs: "$listProduct.sumQtyPcs",
          sumQtyCtn: "$listProduct.sumQtyCtn",
          sumQtyPcsStockIn: "$listProduct.sumQtyPcsStockIn",
          sumQtyCtnStockIn: "$listProduct.sumQtyCtnStockIn",
          sumQtyPcsStockOut: "$listProduct.sumQtyPcsStockOut",
          sumQtyCtnStockOut: "$listProduct.sumQtyCtnStockOut",
          available: "$listProduct.available"
        }
      }
    ]);

    let listProductStock = []
    let updateLot = []

    for (const stockDetail of stock) {
      for (const lot of stockDetail.available) {

        const calDetails = calStock.product.filter(
          u => u.productId === stockDetail.productId && u.lot === lot.lot
        );

        let pcsQty = 0;
        let ctnQty = 0;

        for (const cal of calDetails) {
          if (cal.unit === 'PCS' || cal.unit === 'BOT') {
            pcsQty += cal.qty || 0;
          }
          if (cal.unit === 'CTN') {
            ctnQty += cal.qty || 0;
          }
        }
        checkQtyPcs = lot.qtyPcs - pcsQty
        checkQtyCtn = lot.qtyCtn - ctnQty

        if (checkQtyPcs < 0 || checkQtyCtn < 0) {
          return res.status(400).json({
            status: 400,
            message: `This lot ${lot.lot} is not enough to sale`
          })
        }

        updateLot.push({
          productId: stockDetail.productId,
          location: lot.location,
          lot: lot.lot,
          qtyPcs: lot.qtyPcs - pcsQty,
          qtyPcsStockIn: lot.qtyPcsStockIn,
          qtyPcsStockOut: lot.qtyPcsStockOut + pcsQty,
          qtyCtn: lot.qtyCtn - ctnQty,
          qtyCtnStockIn: lot.qtyCtnStockIn,
          qtyCtnStockOut: lot.qtyCtnStockOut + ctnQty
        })
      }
      const relatedLots = updateLot.filter((u) => u.productId === stockDetail.productId);
      listProductStock.push({
        productId: stockDetail.productId,
        sumQtyPcs: relatedLots.reduce((total, item) => total + item.qtyPcs, 0),
        sumQtyCtn: relatedLots.reduce((total, item) => total + item.qtyCtn, 0),
        sumQtyPcsStockIn: relatedLots.reduce((total, item) => total + item.qtyPcsStockIn, 0),
        sumQtyCtnStockIn: relatedLots.reduce((total, item) => total + item.qtyCtnStockIn, 0),
        sumQtyPcsStockOut: relatedLots.reduce((total, item) => total + item.qtyPcsStockOut, 0),
        sumQtyCtnStockOut: relatedLots.reduce((total, item) => total + item.qtyCtnStockOut, 0),
        available: relatedLots.map(({ id, ...rest }) => rest),
      });
    }

    for (const updated of listProductStock) {
      await Stock.findOneAndUpdate(
        { area: area, period: period },
        {
          $set: {
            "listProduct.$[product].sumQtyPcs": updated.sumQtyPcs,
            "listProduct.$[product].sumQtyCtn": updated.sumQtyCtn,
            "listProduct.$[product].sumQtyPcsStockIn": updated.sumQtyPcsStockIn,
            "listProduct.$[product].sumQtyCtnStockIn": updated.sumQtyCtnStockIn,
            "listProduct.$[product].sumQtyPcsStockOut": updated.sumQtyPcsStockOut,
            "listProduct.$[product].sumQtyCtnStockOut": updated.sumQtyCtnStockOut,
            "listProduct.$[product].available": updated.available
          }
        },
        { arrayFilters: [{ "product.productId": updated.productId }], new: true }
      )
    }

    const createdMovement = await StockMovement.create({
      ...calStock
    });

    await StockMovementLog.create({
      ...calStock,
      refOrderId: createdMovement._id
    });


    await newOrder.save()
    await Cart.deleteOne({ type, area, storeId })

    const checkIn = await checkInRoute({
      storeId: storeId,
      routeId: routeId,
      orderId: orderId,
      note: note,
      latitude: latitude,
      longitude: longitude
    }, channel, res)

    res.status(200).json({
      status: 200,
      message: 'Checkout successful!',
      data: newOrder
      // data:summary
      // data:data
    })


  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getOrder = async (req, res) => {
  try {
    const { type, area, store, period } = req.query

    const channel = req.headers['x-channel'];


    const { Order } = getModelsByChannel(channel, res, orderModel);



    let response = []

    if (!type || !area || !period) {
      return res
        .status(400)
        .json({ status: 400, message: 'type, area, period are required!' })
    }

    const { startDate, endDate } = rangeDate(period)

    let query = {
      type,
      'store.area': area,
      createdAt: { $gte: startDate, $lt: endDate }
    }

    if (store) {
      query['store.storeId'] = store
    }

    const order = await Order.find(query)
      .select(
        'orderId store.createdAt store.storeId store.name store.address total status createdAt'
      )
      .lean()
    // console.log("order",order)
    if (!order || order.length === 0) {
      return res.status(404).json({
        status: 404,
        message: 'No orders found!',
        data: []
      })
    }

    response = order.map(o => ({
      orderId: o.orderId,
      storeId: o.store?.storeId || '',
      storeName: o.store?.name || '',
      storeAddress: o.store?.address || '',
      createAt: o.createdAt,
      total: o.total,
      status: o.status,
      createdAt: o.createdAt
    }))

    res.status(200).json({
      status: 200,
      message: 'Successful!',
      data: response
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getDetail = async (req, res) => {
  try {
    const { orderId } = req.params

    const channel = req.headers['x-channel'];


    const { Order } = getModelsByChannel(channel, res, orderModel);

    if (!orderId) {
      return res
        .status(400)
        .json({ status: 400, message: 'orderId is required!' })
    }

    const order = await Order.findOne({ orderId })

    if (!order) {
      return res.status(404).json({
        status: 404,
        message: `Not found this ${orderId}`
      });
    }


    res.status(200).json({
      status: 200,
      message: 'successful!',
      data: [order]
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.updateStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body

    const channel = req.headers['x-channel'];


    const { Order } = getModelsByChannel(channel, res, orderModel);


    if (!orderId || !status) {
      return res
        .status(400)
        .json({ status: 400, message: 'orderId, status are required!' })
    }

    const order = await Order.findOne({ orderId })
    if (!order) {
      return res.status(404).json({ status: 404, message: 'Order not found!' })
    }

    if (order.status !== 'pending' && status !== 'canceled') {
      return res.status(400).json({
        status: 400,
        message: 'Cannot update status, order is not in pending state!'
      })
    }

    let newOrderId = orderId

    if (status === 'canceled' && !orderId.endsWith('CC')) {
      newOrderId = `${orderId}CC`

      const isDuplicate = await Order.findOne({ orderId: newOrderId })
      if (isDuplicate) {
        let counter = 1
        while (await Order.findOne({ orderId: `${orderId}CC${counter}` })) {
          counter++
        }
        newOrderId = `${orderId}CC${counter}`
      }
    }

    const updatedOrder = await Order.findOneAndUpdate(
      { orderId },
      { $set: { status, orderId: newOrderId } },
      { new: true }
    )

    res.status(200).json({
      status: 200,
      message: 'Updated status successfully!'
    })
  } catch (error) {
    console.error('Error updating order:', error)
    res.status(500).json({ status: 500, message: 'Server error' })
  }
}

exports.addSlip = async (req, res) => {
  try {

    const channel = req.headers['x-channel'];

    const { Order } = getModelsByChannel(channel, res, orderModel);

    upload(req, res, async err => {
      if (err) {
        return res.status(400).json({
          status: 400,
          message: 'Error uploading file',
          error: err.message
        })
      }

      const { orderId, type } = req.body
      if (!orderId || !type) {
        return res
          .status(400)
          .json({ status: 400, message: 'orderId and type required!' })
      }

      const order = await Order.findOne({ orderId })
      if (!order) {
        return res
          .status(404)
          .json({ status: 404, message: 'Order not found!' })
      }

      if (!req.file) {
        return res
          .status(400)
          .json({ status: 400, message: 'No images uploaded!' })
      }

      const basePath = path.join(__dirname, '../../public/images')
      const uploadedImage = await uploadFiles(
        [req.file],
        basePath,
        type,
        order.orderId
      )

      order.listImage = [
        {
          name: uploadedImage[0].name,
          path: uploadedImage[0].path,
          type: type
        }
      ]

      await order.save()

      res.status(200).json({
        status: 200,
        message: 'Images uploaded successfully!',
        data: order.listImage
      })
    })
  } catch (error) {
    console.error('Error uploading images:', error)
    res
      .status(500)
      .json({ status: 500, message: 'Server error', error: error.message })
  }
}

exports.OrderToExcel = async (req, res) => {
  const { channel, date } = req.query;

  console.log(channel, date)

  if (!date || date === 'null') {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0'); // เดือนเริ่มที่ 0
    const day = String(today.getDate()).padStart(2, '0');

    date = `${year}${month}${day}`;
    console.log("📅 date:", date);

  }

  const start = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00+07:00`);
  const end = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T23:59:59.999+07:00`);


  // const channel = 'cash';
  const { Order } = getModelsByChannel(channel, res, orderModel);


  // const modelOrder = await Order.find({
  //   orderId: { $not: /CC/ },
  // })

  const modelOrder = await Order.aggregate([
    {
      $match: {
        orderId: { $not: /CC/ }
      }
    },
    {
      $addFields: {
        createdAtThai: {
          $dateAdd: {
            startDate: '$createdAt',
            unit: 'hour',
            amount: 7
          }
        }
      }
    },
    {
      $match: {
        createdAtThai: {
          $gte: start,
          $lte: end
        }
      }
    }
  ]);


  // console.log(modelOrder)
  const tranFromOrder = modelOrder.flatMap(order => {
    let counterOrder = 0
    const date = new Date()
    const RLDT = `${date.getFullYear()}${(date.getMonth() + 1)
      .toString()
      .padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`

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
        CUNO: order.sale.salePayer,
        FACI: 'F10',
        WHLO: order.sale.warehouse,
        ORNO: '',
        OAORTP: '',
        RLDT: RLDT,
        ADID: order.shipping.shippingId,
        CUOR: order.orderId,
        OAOREF: '',
        OBITNO: product.id,
        OBBANO: '',
        OBALUN: product.unit,
        OBORQA: Number(product.qty),
        OBSAPR: Number(product.price || 0),
        OBSPUN: product.unit,
        OBWHSL: '',
        ROUT: '',
        OBPONR: Number(counterOrder),
        OBDIA2: Number(product.discount || 0),
        OBRSCD: '',
        OBCMNO: '',
        OBPIDE: product.proCode,
        OBSMCD: order.sale.saleCode,
        OAORDT: RLDT,
        OAODAM: '',
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

  if (tranFromOrder.length == 0) {
    return res.status(404).json({
      status: (404),
      message: "Not Found Order"
    })
  }

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(tranFromOrder);
  xlsx.utils.book_append_sheet(wb, ws, 'Orders');

  const tempPath = path.join(os.tmpdir(), `Order_${Date.now()}.xlsx`);
  xlsx.writeFile(wb, tempPath);

  res.download(tempPath, 'Order.xlsx', (err) => {
    if (err) {
      console.error('❌ Download error:', err);
      // อย่าพยายามส่ง response ซ้ำถ้า header ถูกส่งแล้ว
      if (!res.headersSent) {
        res.status(500).send('Download failed');
      }
    }

    // ✅ ลบไฟล์ทิ้งหลังจากส่งเสร็จ (หรือส่งไม่สำเร็จ)
    fs.unlink(tempPath, () => { });
  });



  // res.status(200).json({
  //   message: 'Create file successful!'
  // })
}


exports.OrderToExcelConJob = async (req, res) => {

  channel = ['cash', 'credit']

  for (const ch of channel) {

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0'); // เดือนเริ่มที่ 0
    const day = String(today.getDate()).padStart(2, '0');

    date = `${year}${month}${day}`;
    console.log("📅 date:", date);

    const start = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00+07:00`);
    const end = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T23:59:59.999+07:00`);


    // const channel = req.headers['x-channel'];
    const { Order } = getModelsByChannel(ch, res, orderModel);


    // const modelOrder = await Order.find({
    //   orderId: { $not: /CC/ },
    // })

    const modelOrder = await Order.aggregate([
      {
        $match: {
          orderId: { $not: /CC/ }
        }
      },
      {
        $addFields: {
          createdAtThai: {
            $dateAdd: {
              startDate: '$createdAt',
              unit: 'hour',
              amount: 7
            }
          }
        }
      },
      {
        $match: {
          createdAtThai: {
            $gte: start,
            $lte: end
          }
        }
      }
    ]);


    // console.log(modelOrder)
    const tranFromOrder = modelOrder.flatMap(order => {
      let counterOrder = 0
      const date = new Date()
      const RLDT = `${date.getFullYear()}${(date.getMonth() + 1)
        .toString()
        .padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`

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
          CUNO: order.sale.salePayer,
          FACI: 'F10',
          WHLO: order.sale.warehouse,
          ORNO: '',
          OAORTP: 'A31',
          RLDT: RLDT,
          ADID: order.shipping.shippingId,
          CUOR: order.orderId,
          OAOREF: '',
          OBITNO: product.id,
          OBBANO: '',
          OBALUN: product.unit,
          OBORQA: Number(product.qty),
          OBSAPR: Number(product.price || 0),
          OBSPUN: product.unit,
          OBWHSL: '',
          ROUT: '',
          OBPONR: Number(counterOrder),
          OBDIA2: Number(product.discount || 0),
          OBRSCD: '',
          OBCMNO: '',
          OBPIDE: product.proCode,
          OBSMCD: order.sale.saleCode,
          OAORDT: RLDT,
          OAODAM: '',
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

    if (tranFromOrder.length == 0) {
      return res.status(404).json({
        status: (404),
        message: "Not Found Order"
      })
    }

    const ws = xlsx.utils.json_to_sheet(tranFromOrder)

    const downloadsPath = path.join(os.homedir(), 'Downloads', `Order${ch}.xlsx`)

    const wb = xlsx.utils.book_new()
    xlsx.utils.book_append_sheet(wb, ws, 'Orders')

    xlsx.writeFile(wb, downloadsPath)

    console.log(`✅ ไฟล์ Order${ch}.xlsx ถูกสร้างแล้วที่:`, downloadsPath)
  }

  // res.status(200).json({
  //   message: 'Create file successful!'
  // })


}











exports.getAllOrder = async (req, res) => {
  try {
    const { period } = req.query

    const channel = req.headers['x-channel'];

    const { Order } = getModelsByChannel(channel, res, orderModel);

    if (period) {
      const periodYear = period.slice(0, 4)
      const month = period.slice(4, 6)

      // สร้างช่วงเวลาของเดือนนั้นใน timezone Bangkok
      const start = new Date(
        new Date(`${periodYear}-${month}-01T00:00:00`).toLocaleString('en-US', {
          timeZone: 'Asia/Bangkok'
        })
      )

      const end = new Date(new Date(start).setMonth(start.getMonth() + 1))

      const modelOrder = await Order.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lt: end },
            type: { $in: ['sale', 'change'] }
          }
        },
        {
          $group: {
            _id: '$store.area', // Group by area
            summary: { $sum: '$total' } // รวม total
          }
        },
        {
          $project: {
            area: '$_id',
            summary: 1,
            // count: 1,
            _id: 0
          }
        }
      ])

      if (modelOrder.length == 0) {
        return res.status(404).json({
          status: 404,
          message: "Not Found Order"
        })
      }

      const data = modelOrder.map(item => ({
        area: item.area,
        summary: item.summary
      }))

      res.status(200).json({
        status: 200,
        message: 'success',
        data: data
      })
    } else {
      const year = parseInt(req.query.year)

      const modelOrder = await Order.aggregate([
        {
          $match: {
            $expr: {
              $eq: [{ $year: '$createdAt' }, year] // ดึงปีจาก createdAt แล้วเปรียบเทียบกับ year
            },
            type: { $in: ['sale', 'change'] }
          }
        },
        {
          $group: {
            _id: '$store.area', // Group by area
            summary: { $sum: '$total' } // รวม total
          }
        },
        {
          $project: {
            area: '$_id',
            summary: 1,
            _id: 0
          }
        }
      ])

      const data = modelOrder.map(item => ({
        area: item.area,
        summary: item.summary
      }))

      res.status(200).json({
        status: 200,
        message: 'success',
        data: data
      })
    }
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getSummaryItem = async (req, res) => {
  try {
    // const { area, period, group, flavour, brand } = req.query

    const { area, period, group, brand, flavour, size, type } = req.body

    const channel = req.headers['x-channel'];


    const { Product } = getModelsByChannel(channel, res, productModel);
    const { Order } = getModelsByChannel(channel, res, orderModel);


    const periodYear = period.slice(0, 4)
    const month = period.slice(4, 6)

    // สร้างช่วงเวลาของเดือนนั้นใน timezone Bangkok
    const start = new Date(
      new Date(`${periodYear}-${month}-01T00:00:00`).toLocaleString('en-US', {
        timeZone: 'Asia/Bangkok'
      })
    )

    const end = new Date(new Date(start).setMonth(start.getMonth() + 1))

    const modelOrder = await Order.aggregate([
      {
        $match: {
          'store.area': area,
          createdAt: { $gte: start, $lt: end },
          type: { $in: ['sale', 'change'] }
        }
      },
      { $unwind: { path: '$listProduct', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          listProduct: 1,
          _id: 0
        }
      }
    ])
    if (!modelOrder || modelOrder.length === 0) {
      return res.status(404).json({
        status: 404,
        message: 'Not Found Order'
      })
    }
    // console.log("modelOrder",modelOrder)


    const productIds = modelOrder.map(order => order.listProduct.id);
    // .listProduct.map(product => product.id)
    // console.log("productIds",productIds)

    const parseArrayParam = (param) => {
      if (!param) return []
      try {
        return typeof param === 'string' ? JSON.parse(param) : param
      } catch (error) {
        return param.split(',')
      }
    }

    let filter = {}
    const groupArray = parseArrayParam(group)
    const brandArray = parseArrayParam(brand)
    const flavourArray = parseArrayParam(flavour)
    const sizeArray = parseArrayParam(size)

    let conditions = []
    if (productIds.length) conditions.push({ id: { $in: productIds } })
    if (groupArray.length) conditions.push({ groupCode: { $in: groupArray } })
    if (brandArray.length) conditions.push({ brandCode: { $in: brandArray } })
    if (flavourArray.length) conditions.push({ flavourCode: { $in: flavourArray } })
    if (sizeArray.length) conditions.push({ size: { $in: sizeArray } })

    if (conditions.length) filter.$and = conditions

    const products = await Product.aggregate([
      { $match: filter }
    ]);

    if (products.length == 0) {
      return res.status(404).json({
        status: 404,
        message: 'Not Found Product'
      })
    }

    const data = products.map(product => {
      const netTotal = modelOrder.find(order => order.listProduct.id === product.id);
      return {
        id: product.id,
        groupCode: product.groupCode,
        brandCode: product.brandCode,
        flavourCode: product.flavourCode,
        size: product.size,
        netTotal: netTotal.listProduct.netTotal
      }
    })

    if (!type) {
      return res.status(404).json({
        status: 404,
        message: 'type is require'
      })
    }


    let result = []

    if (type == "group") {
      const groupedByGroupCode = data.reduce((acc, item) => {

        if (!acc[item.groupCode]) {
          acc[item.groupCode] = {
            groupCode: item.groupCode,
            totalNetTotal: 0
          };
        }

        acc[item.groupCode].totalNetTotal += item.netTotal;

        return acc;
      }, {});


      result = Object.values(groupedByGroupCode);
      // console.log(result)
    }
    else if (type == "flavour") {

      const groupedByFlavourCode = data.reduce((acc, item) => {

        if (!acc[item.flavourCode]) {
          acc[item.flavourCode] = {
            flavourCode: item.flavourCode,
            totalNetTotal: 0
          };
        }

        acc[item.flavourCode].totalNetTotal += item.netTotal;

        return acc;
      }, {});


      result = Object.values(groupedByFlavourCode);
      // console.log(result)
    }

    else if (type == "size") {

      const groupedBySize = data.reduce((acc, item) => {

        if (!acc[item.size]) {
          acc[item.size] = {
            size: item.size,
            totalNetTotal: 0
          };
        }

        acc[item.size].totalNetTotal += item.netTotal;

        return acc;
      }, {});


      result = Object.values(groupedBySize);
      // console.log(result)
    }

    else if (type == "brand") {

      const groupedByBrandCode = data.reduce((acc, item) => {

        if (!acc[item.brandCode]) {
          acc[item.brandCode] = {
            brandCode: item.brandCode,
            totalNetTotal: 0
          };
        }

        acc[item.brandCode].totalNetTotal += item.netTotal;

        return acc;
      }, {});


      result = Object.values(groupedByBrandCode);
      // console.log(result)
    }


    res.status(200).json({
      status: 200,
      message: 'success',
      data: result
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}



exports.getSummarybyRoute = async (req, res) => {
  try {
    const { area, period } = req.query

    const channel = req.headers['x-channel'];

    const { Route } = getModelsByChannel(channel, res, routeModel);



    const modelRoute = await Route.aggregate([
      { $match: { area, period } },
      { $unwind: { path: '$listStore', preserveNullAndEmptyArrays: true } },
      {
        $unwind: {
          path: '$listStore.listOrder',
          preserveNullAndEmptyArrays: true
        }
      },

      // JOIN: นำ orderId จาก listOrder ไป join กับ collection Order
      {
        $lookup: {
          from: 'orders', // ชื่อ collection ที่จะ join
          localField: 'listStore.listOrder.orderId',
          foreignField: 'orderId',
          as: 'orderDetails'
        }
      },

      // group by day, และ sum total จาก orderDetails
      {
        $group: {
          _id: '$day',
          totalAmount: {
            $sum: {
              $sum: {
                // เพิ่มการ sum ในนี้ถ้า `orderDetails` มีหลายรายการ
                $map: {
                  input: '$orderDetails', // เข้าไปใน array `orderDetails`
                  as: 'order', // ชื่อ alias ให้กับแต่ละ element ใน array
                  in: '$$order.total' // นำค่า `total` มารวมกัน
                }
              }
            }
          },
          orders: {
            $push: {
              total: { $arrayElemAt: ['$orderDetails.total', 0] } // ใช้ arrayElemAt สำหรับเลือก `total` ถ้ามีแค่ 1
            }
          }
        }
      },

      { $sort: { _id: 1 } },

      {
        $project: {
          day: '$_id',
          // orders: 1,
          totalAmount: 1,
          _id: 0
        }
      }
    ])

    if (modelRoute.length === 0) {
      return res.status(404).json({
        status: 404,
        message: 'Not Found Route'
      })
    }

    data = modelRoute.map(item => {
      return {
        route: item.day,
        summary: item.totalAmount
      }
    })

    res.status(200).json({
      status: 200,
      message: 'success',
      data: data
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getSummarybyMonth = async (req, res) => {
  try {
    const { area, year, storeId, day } = req.query
    const channel = req.headers['x-channel']; // 'credit' or 'cash'

    // const { Store } = getModelsByChannel(channel,res,storeModel); 
    // const { Route } = getModelsByChannel(channel,res,routeModel); 
    const { Order } = getModelsByChannel(channel, res, orderModel);

    let pipeline = []

    pipeline.push(
      {
        $match: {
          'store.area': area
        }
      },
      { $unwind: { path: '$listStore', preserveNullAndEmptyArrays: true } },
      // { $match: matchStore },
      {
        $unwind: {
          path: '$listStore.listOrder',
          preserveNullAndEmptyArrays: true
        }
      },

      {
        $addFields: {
          createdAtThai: {
            $dateAdd: {
              startDate: '$createdAt',
              unit: 'hour',
              amount: 7
            }
          }
        }
      },
      {
        $addFields: {
          createdDay: { $dayOfMonth: '$createdAtThai' }
        }
      },
      {
        $addFields: {
          createdYear: { $year: '$createdAtThai' }
        }
      }
    )

    if (storeId) {
      pipeline.push({
        $match: {
          'store.storeId': storeId
        }
      })
    }
    if (year) {
      pipeline.push({
        $match: {
          createdYear: parseInt(year)
        }
      })
    }

    pipeline.push(
      {
        $project: {
          month: { $month: '$createdAtThai' },
          total: '$total'
        }
      },
      {
        $group: {
          _id: '$month',
          totalAmount: { $sum: '$total' }
        }
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          month: '$_id',
          totalAmount: 1,
          _id: 0
        }
      }
    )

    const modelOrder = await Order.aggregate(pipeline)
    const modelOrderValue = modelOrder.map(item => {
      return {
        month: item.month,
        summary: item.totalAmount
      }
    })

    const result = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      summary: 0
    }));

    // อัปเดตผลลัพธ์จาก data ที่มีอยู่
    modelOrderValue.forEach(d => {
      result[d.month - 1].summary = d.summary;
    });


    res.status(200).json({
      status: 200,
      message: 'Success',
      data: result
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Internal server error.' })
  }
}

exports.getSummarybyArea = async (req, res) => {
  try {
    const { period, year, type, zone, area } = req.query
    let query = {}

    if (area) {
      query = {
        $match: {
          area: area
        }
      }
    }
    else {
      query = {
        $match: {
          area: { $ne: null }
        }
      }
    }

    const channel = req.headers['x-channel']; // 'credit' or 'cash'

    const { Route } = getModelsByChannel(channel, res, routeModel);

    if (!period) {
      return res.status(404).json({
        status: 404,
        message: "period is require"
      })
    }

    // if (type == 'route') {

    let groupStage = {}
    if (zone && type == 'route') {
      groupStage = {
        $group: {
          _id: { area: "$area", route: "$day" },
          totalAmount: { $sum: "$orderDetails.total" }
        }
      }
    }
    else if (area && type == 'route') {
      groupStage = {
        $group: {
          _id: { area: "$area", route: "$day" },
          totalAmount: { $sum: "$orderDetails.total" }
        }
      }
    }
    else if (type == 'route') {
      groupStage = {
        $group: {
          _id: { area: "$area2", route: "$day" },
          totalAmount: { $sum: "$orderDetails.total" }
        }
      }
    }
    else if (zone && type == 'year') {
      groupStage = {
        $group: {
          _id: { area: "$area", route: "$month" },
          totalAmount: { $sum: "$orderDetails.total" }
        }
      }
    }
    else if (area && type == 'year') {
      groupStage = {
        $group: {
          _id: { area: "$area", route: "$month" },
          totalAmount: { $sum: "$orderDetails.total" }
        }
      }
    }
    else if (type == 'year') {
      groupStage = {
        $group: {
          _id: { area: "$area2", route: "$month" },
          totalAmount: { $sum: "$orderDetails.total" }
        }
      }
    }

    // console.log("groupStage",groupStage)
    const modelRouteValue = await Route.aggregate([
      { $match: { period } },
      { $project: { area: 1, day: 1, listStore: 1 } },
      { $unwind: { path: "$listStore", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$listStore.listOrder", preserveNullAndEmptyArrays: true } },

      {
        $addFields: {
          convertedDate: {
            $dateToString: {
              format: "%Y-%m-%dT%H:%M:%S",
              date: "$listStore.listOrder.date",
              timezone: "Asia/Bangkok"
            }
          },
          month: { $month: "$listStore.listOrder.date" },
          area2: { $substrCP: ["$area", 0, 2] }
        }
      },
      {
        $match: {
          $expr: {
            $cond: {
              if: { $eq: [year, null] },
              then: true,
              else: {
                $eq: [
                  { $substr: ["$convertedDate", 0, 4] },
                  { $toString: year }
                ]
              }
            }
          }
        }
      },
      query,
      {
        $lookup: {
          from: "orders",
          localField: "listStore.listOrder.orderId",
          foreignField: "orderId",
          as: "orderDetails"
        }
      },
      { $unwind: { path: "$orderDetails", preserveNullAndEmptyArrays: true } },
      groupStage,

    ]);

    // console.log("modelRouteValue",modelRouteValue)

    const haveArea = [...new Set(modelRouteValue.map(i => i.area))];
    otherModelRoute = await Route.aggregate([
      {
        $match: {
          period: period,
          area: { $nin: haveArea }
        }
      },
      { $project: { area: 1, day: 1, listStore: 1 } },
      { $unwind: { path: "$listStore", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$listStore.listOrder", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          month: { $month: "$listStore.listOrder.date" },
          area2: { $substrCP: ["$area", 0, 2] }
        }
      },
      {
        $lookup: {
          from: "orders",
          localField: "listStore.listOrder.orderId",
          foreignField: "orderId",
          as: "orderDetails"
        }
      },
      { $unwind: { path: "$orderDetails", preserveNullAndEmptyArrays: true } },
      query,
      groupStage,
      {
        $project: {
          area: "$_id.area",
          route: "$_id.route",
          totalAmount: 1,
          _id: 0
        }
      },
      { $sort: { area: 1, route: 1 } }
    ]);


    if (modelRouteValue.length === 0) {
      return res.status(404).json({
        status: 404,
        message: 'Not Found Route This period'
      })
    }


    modelRoute = [...modelRouteValue, ...otherModelRoute];


    // const areaList = [...new Set(modelRoute.map(item => item.area))].filter(area => area !== undefined).sort();

    const areaList = [
      ...new Set(
        modelRoute
          .map(item => item.area)
          .filter(areaItem => areaItem && (zone ? areaItem.startsWith(zone) : true))
      )
    ].sort();

    let data = [];

    if (type === 'route' || type === 'year') {
      const totalMonths = type === 'route' ? 27 : 12;

      data = areaList.map(area => {
        const filtered = modelRoute.filter(item => item.area === area);

        const filledMonths = Array.from({ length: totalMonths }, (_, i) => {
          const month = String(i + 1).padStart(2, '0');
          const found = filtered.find(item => String(item.route).padStart(2, '0') === month);

          return found || {
            totalAmount: 0,
            area,
            month
          };
        });

        return {
          area,
          summary: filledMonths.map(item => item.totalAmount)
        };
      });
    }

    res.status(200).json({
      status: 200,
      message: 'Success',
      data: data
    })
    // }

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Internal server error.' })
  }
}


exports.getSummarybyGroup = async (req, res) => {
  try {
    const { zone, group, period } = req.body

    const channel = req.headers['x-channel']; // 'credit' or 'cash'

    const { Order } = getModelsByChannel(channel, res, orderModel);
    const { Product } = getModelsByChannel(channel, res, productModel);


    const year = parseInt(period.slice(0, 4));
    const month = period.slice(4, 6)

    const start = DateTime.fromObject({ year, month, day: 1 }, { zone: 'Asia/Bangkok' }).toUTC().toJSDate();
    const end = DateTime.fromObject({ year, month, day: 1 }, { zone: 'Asia/Bangkok' }).plus({ months: 1 }).toUTC().toJSDate();

    const modelOrder = await Order.aggregate([
      {
        $match: {
          "store.zone": zone,  // กรองตาม zone
          createdAt: { $gte: start, $lt: end },
        }
      },
      { $unwind: { path: "$listProduct", preserveNullAndEmptyArrays: false } },
      { $match: { "listProduct.groupCode": group } },
    ]);

    const order = modelOrder.map(u => {
      return {
        id: u.listProduct.id,
        groupCode: u.listProduct.groupCode,
        size: u.listProduct.size,
        flavourCode: u.listProduct.flavourCode,
        qty: u.listProduct.qty

      }
    })

    // console.log("order",order)

    const modelProduct = await Product.aggregate([
      { $match: { groupCode: group } },
      {
        $group: {

          _id: "$size",
          entries: {
            $push: {
              k: "$flavourCode",
              v: 0
            }
          },
          total: { $sum: "$value" }
        }
      },

      {
        $addFields: {
          entriesObject: { $arrayToObject: "$entries" }
        }
      },

      {
        $addFields: {
          fullObject: {
            $mergeObjects: [
              "$entriesObject",
              {
                $arrayToObject: [
                  [
                    {
                      k: { $concat: ["รวม", "$_id"] }, // ต่อข้อความ "รวม" + ขนาด
                      v: "$total"
                    }
                  ]
                ]
              }
            ]
          }
        }
      }
      ,
      {
        $replaceRoot: {
          newRoot: {
            $arrayToObject: [[
              { k: "$_id", v: "$fullObject" }
            ]]
          }
        }
      },

    ]);

    if (!modelProduct || modelProduct.length === 0) {
      return res.status(404).json({
        status: 404,
        message: `Not found order for group ${group} and period ${period} `
      });
    }

    for (const item of order) {
      const { size, flavourCode, qty } = item;

      const model = modelProduct.find(obj => obj[size]);
      if (!model) continue;

      if (model[size][flavourCode] !== undefined) {
        model[size][flavourCode] += qty;

        const sumKey = `รวม${size}`;
        if (model[size][sumKey] !== undefined) {
          model[size][sumKey] += qty;
        }
      }
    }

    res.status(200).json({
      status: 200,
      message: 'Success',
      data: modelProduct
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Internal server error.' })
  }
}

exports.erpApiCheck = async (req, res) => {
  try {

    const channel = req.headers['x-channel'];

    const { Order } = getModelsByChannel(channel, res, orderModel);


    const modelSale = await Sale.findAll({
      attributes: [
        'OAORNO',
        [sequelize.fn('COUNT', sequelize.col('OAORNO')), 'count']
      ],
      group: ['OAORNO']
    })

    const saleId = modelSale.map(row => row.get('OAORNO'))
    // notInmodelOrder = await Order.find({
    //   orderId: { $nin: saleId }
    // }).select("orderId")
    const data = await Order.updateMany(
      { orderId: { $in: saleId } },
      {
        $set: {
          status: 'success',
        }
      }
    )

    // console.log(data.modifiedCount)

    if (data.modifiedCount == 0) {
      return res.status(404).json({
        status: 404,
        message: 'No new orders found in the M3 system'
      })
    }

    const io = getSocket()
    const events = [
      'sale_getSummarybyArea',
      'sale_getSummarybyMonth',
      'sale_getSummarybyRoute',
      'sale_getSummaryItem',
      'sale_getSummarybyGroup',
      'sale_getRouteCheckinAll',
      'sale_getTimelineCheckin',
      'sale_routeTimeline',
    ]

    events.forEach(event => {
      io.emit(event, {
        status: 200,
        message: 'New Update Data',
        // data: data
      })
    })

    res.status(200).json(
      {
        status: 200,
        message: 'Update status Sucess'
      }
    )



  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Internal server error.' })
  }
}

exports.getSummarybyChoice = async (req, res) => {

  const { storeId, area, date, type, } = req.body
  let dayStr, monthStr, yearStr;

  const channel = req.headers['x-channel'];

  const { Order } = getModelsByChannel(channel, res, orderModel);



  if (!date) {
    return res.status(400).json({
      status: 400,
      message: "Date is required"
    })
  }

  if (type == 'day') {
    dayStr = parseInt(date.substring(0, 2), 10);
  }
  else if (type == 'month') {
    monthStr = parseInt(date.substring(2, 4), 10);
  }
  else if (type == 'year') {
    yearStr = parseInt(date.substring(4, 8), 10);
  }

  let matchStage = {}
  matchStage["store.area"] = area;
  if (storeId) {
    matchStage["store.storeId"] = storeId;
  }
  const match = {}
  if (dayStr) match.day = dayStr
  if (monthStr) match.month = monthStr
  if (yearStr) match.year = yearStr



  const modelOrder = await Order.aggregate([
    { $match: matchStage },
    {
      $addFields: {
        createdAtThai: {
          $dateAdd: {
            startDate: "$createdAt",
            unit: "hour",
            amount: 7
          }
        }
      }
    },
    {
      $addFields: {
        day: { $dayOfMonth: "$createdAtThai" },
        month: { $month: "$createdAtThai" },
        year: { $year: "$createdAtThai" }
      }
    },
    {
      $match: match
    },
    {
      $group: {
        _id: type,
        total: { $sum: "$total" }
      }
    },
    {
      $project: {
        _id: 0,
        total: 1
      }
    }
  ])

  if (modelOrder.length === 0) {
    return res.status(404).json({
      status: 404,
      message: "Not found order"
    })
  }



  res.status(200).json({
    status: 200,
    message: "Successful",
    total: modelOrder[0].total
  })
}

exports.getSaleSummaryByStore = async (req, res) => {

  const { routeId } = req.body
  const channel = req.headers['x-channel'];
  const { Route } = getModelsByChannel(channel, res, routeModel);

  const routeData = await Route.aggregate([
    {
      $match: {
        id: routeId
      }
    },
    { $unwind: { path: '$listStore', preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$listStore.listOrder', preserveNullAndEmptyArrays: true } },

    {
      $addFields: {
        storeObjId: { $toObjectId: "$listStore.storeInfo" }
      }
    },
    {
      $lookup: {
        from: 'stores',
        localField: 'storeObjId',
        foreignField: '_id',
        as: 'storeDetail'
      }
    },

    {
      $lookup: {
        from: 'orders',
        localField: 'listStore.listOrder.orderId',
        foreignField: 'orderId',
        as: 'order'
      }
    },
    {
      $project: {
        storeId: { $arrayElemAt: ['$storeDetail.storeId', 0] },
        storeName: { $arrayElemAt: ['$storeDetail.name', 0] },
        orderId: {
          $ifNull: ['$listStore.listOrder.orderId', '']
        },
        status: '$listStore.statusText'
        ,

        sum: {
          $ifNull: [{ $arrayElemAt: ['$order.total', 0] }, 0]
        },
        phone: { $arrayElemAt: ['$storeDetail.tel', 0] },
        mapLink: {
          $concat: [
            'https://maps.google.com/?q=',
            { $toString: { $arrayElemAt: ['$storeDetail.latitude', 0] } },
            ',',
            { $toString: { $arrayElemAt: ['$storeDetail.longtitude', 0] } }
          ]
        },
        datetime: {
          $cond: {
            if: { $ne: ['$listStore.listOrder.date', null] },
            then: {
              $dateToString: {
                date: {
                  $dateAdd: {
                    startDate: '$listStore.listOrder.date',
                    unit: 'hour',
                    amount: 7
                  }
                },
                format: '%Y-%m-%d %H:%M:%S',
                timezone: 'Asia/Bangkok'
              }
            },
            else: ''
          }
        },
      }
    }
  ])

  res.status(200).json({
    status: 200,
    message: 'sucess',
    data: routeData
  })
}


exports.getGroup = async (req, res) => {

  const channel = req.headers['x-channel'];
  const { Product } = getModelsByChannel(channel, res, productModel);
  const product = await Product.aggregate([
    {
      $group: {
        _id: {
          groupCode: "$groupCode",
          group: "$group"
        },
      }
    },
    {
      $project: {
        _id: 0,
        groupCode: "$_id.groupCode",
        group: "$_id.group"
      }
    },
    {
      $sort: { groupCode: 1 } // ✅ เรียงตาม groupCode
    }
  ]);


  res.status(200).json({
    message: product
  })

}

exports.getSummaryProduct = async (req, res) => {

  const { zone } = req.query

  const channel = req.headers['x-channel']

  const { Route } = getModelsByChannel(channel, res, routeModel)
  const { Product } = getModelsByChannel(channel, res, productModel)
  const { User } = getModelsByChannel(channel, res, userModel)
  const { Store } = getModelsByChannel(channel, res, storeModel)


  const route = await Route.aggregate([
    {
      $addFields: {
        shortArea: { $substr: ["$area", 0, 2] }
      }
    },
    {
      $match: {
        shortArea: zone
      }
    },
    { $unwind: { path: '$listStore', preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$listStore.listOrder', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        storeObjId: { $toObjectId: "$listStore.storeInfo" }
      }
    },
    {
      $lookup: {
        from: 'orders',
        localField: 'listStore.listOrder.orderId',
        foreignField: 'orderId',
        as: 'order'
      }
    },
    {
      $match: {
        $expr: { $gt: [{ $size: "$order" }, 0] }
      }
    },
    {
      $project: {
        'order': 1
      }
    },
    { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$order.listProduct', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        '_id': 0,
        store: '$order.store.storeId',
        area: '$order.store.area',
        productId: '$order.listProduct.id',
        group: '$order.listProduct.groupCode',
        size: '$order.listProduct.size',
        unit: '$order.listProduct.unit',
        qty: '$order.listProduct.qty'
      }
    },
  ])

  const productId = route.flatMap(u => u.productId)

  const productFactor = await Product.aggregate([
    {
      $match: {
        id: { $in: productId }
      }
    },
    { $unwind: { path: '$listUnit', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        productId: '$id',
        group: '$listUnit.groupCode',
        size: '$listUnit.size',
        unit: '$listUnit.unit',
        factor: '$listUnit.factor'
      }
    }
  ])

  const productQty = route.map(u => {
    const qty = productFactor.find(i => i.productId === u.productId && i.unit == u.unit) || {}
    const factorPcs = (u.qty * qty.factor)
    const factorCtn = productFactor.find(i => i.productId === u.productId && i.unit == "CTN") || {}
    const qtyCtn = Math.floor((factorPcs / factorCtn.factor))

    return {
      store: u.store,
      area: u.area,
      productId: u.productId,
      group: u.group,
      size: u.size,
      unit: 'CTN',
      qty: qtyCtn
    }
  })

  const grouped = [];

  productQty.forEach(item => {
    const existing = grouped.find(g =>
      g.store === item.store &&
      g.area === item.area &&
      g.productId === item.productId &&
      g.group === item.group &&
      g.size === item.size &&
      g.unit === item.unit
    );

    if (existing) {
      existing.qty += item.qty;
    } else {
      grouped.push({ ...item });
    }
  });


  const product = await Product.aggregate([
    {
      $addFields: {
        groupSize: {
          $concat: ['$groupCode', ' ', '$size']
        }
      }
    },
    {
      $group: {
        _id: {
          productId: '$id',
          groupCode: "$groupSize",
        }
      }
    },
    {
      $project: {
        _id: 0,
        productId: '$_id.productId',
        groupSize: '$_id.groupCode'
      }
    }
  ])

  const area = await User.aggregate([
    {
      $addFields: {
        shortArea: { $substr: ["$area", 0, 2] }
      }
    },
    {
      $match: {
        shortArea: zone
      }
    },
    {
      $group: {
        _id: '$area'
      }
    },
    {
      $project: {
        _id: 0,
        area: '$_id'
      }
    }
  ])


  if (area.length == 0) {
    return res.status(404).json({
      status: 404,
      message: 'Not found zone'
    })
  }

  const result = area.map(({ area }) => {
    return product.map(product => ({
      ...product,
      area
    }));
  });

  // ถ้าอยากให้เป็น flat array (ไม่เป็นกลุ่ม area): ใช้ .flat()
  const areaProduct = result.flat();


  const countStore = [];

  grouped.forEach(item => {
    const existing = countStore.find(g =>
      g.store === item.store &&
      g.area === item.area &&
      g.productId === item.productId &&
      g.unit === item.unit
    );
    if (existing) {
      existing.count += 1; // เพิ่มจำนวนที่เจอซ้ำ
    } else {
      countStore.push({
        store: item.store,
        area: item.area,
        productId: item.productId,
        unit: item.unit,
        count: 1 // เริ่มต้นนับเป็น 1
      });
    }
  });

  const constStoreOnArea = await Store.aggregate([
    {
      $group: {
        _id: '$area',
        storeIds: { $addToSet: '$storeId' } // เก็บ storeId ที่ไม่ซ้ำใน array
      }
    },
    {
      $project: {
        area: '$_id',
        constStore: { $size: '$storeIds' }, // นับจำนวน storeId ที่ไม่ซ้ำ
        _id: 0
      }
    }
  ])

  // console.log("areaProduct",areaProduct)


  const productTran = areaProduct.map(item => {
    const productDetail = grouped.find(u => u.productId == item.productId && u.area == item.area)

    const storeCount = countStore.find(u => u.productId == item.productId && u.area == item.area)
    const allStoreCount = constStoreOnArea.find(u => u.area == item.area)

    const percentStore = allStoreCount?.constStore
      ? ((storeCount?.count || 0) / allStoreCount.constStore * 100).toFixed(2)
      : 0;



    return {
      // productId: item.productId,
      area: item.area,
      [`TRAGET ${item.groupSize}`]: 0,
      [`SELL ${item.groupSize}`]: productDetail?.qty || 0,
      [`PERCENT ${item.groupSize}`]: 0,
      [`TRAGET STORE ${item.groupSize}`]: 0,
      [`STORE ${item.groupSize}`]: storeCount?.count || 0,
      [`PERCENT STORE ${item.groupSize}`]: Number(percentStore)
    }
  })

  const areaId = [...new Set(productTran.map(u => u.area))].map(area => ({ area }));

  const data = areaId.map(item => {
    const productDetail = productTran.filter(u => u.area === item.area)
    
    const mergedDetail = productDetail.reduce((acc, curr) => {
      const { area, ...rest } = curr; 

      return { ...acc, ...rest };
    }, {});

    return {
      area: item.area,
      ...mergedDetail
    };
  });

  const summaryTarget = productTran.reduce((sum, item) => {
    const key = Object.keys(item).find(k =>
      k.startsWith("TRAGET ") && !k.includes("TRAGET STORE")
    )
    return sum + (item[key] || 0)
  }, 0)


  const summarySell = productTran.reduce((sum, item) => {
    const key = Object.keys(item).find(k => k.startsWith("SELL "))
    return sum + (item[key] || 0)
  }, 0)

  const summaryPercent = productTran.reduce((sum, item) => {
    const key = Object.keys(item).find(k =>
      k.startsWith("PERCENT ") && !k.includes("PERCENT STORE")
    )
    return sum + (item[key] || 0)
  }, 0)

  const summaryTargetStore = productTran.reduce((sum, item) => {
    const key = Object.keys(item).find(k => k.startsWith("TRAGET STORE "))
    return sum + (item[key] || 0)
  }, 0)

  const summaryStore = productTran.reduce((sum, item) => {
    const key = Object.keys(item).find(k => k.startsWith("STORE "))
    return sum + (item[key] || 0)
  }, 0)


  const totalStoreCount = productTran.reduce((sum, item) => {
    const key = Object.keys(item).find(k => k.startsWith("STORE "))
    return sum + (item[key] || 0)
  }, 0)


  const totalAllStoreCount = constStoreOnArea.reduce((sum, item) => {
    return sum + (item.constStore || 0)
  }, 0)


  const summaryPercentStore = totalAllStoreCount > 0
    ? Number(((totalStoreCount / totalAllStoreCount) * 100).toFixed(2))
    : 0

  const dataTran = {
    data,
    summaryTarget: summaryTarget,
    summarySell: summarySell,
    summaryPercent: summaryPercent,
    summaryTargetStore: summaryTargetStore,
    summaryStore: summaryStore,
    summaryPercentStore: summaryPercentStore,
  }





  res.status(200).json({
    status: 200,
    message: "Success",
    ...dataTran
  })

}












exports.getProductLimit = async (req, res) => {

  const { storeId, area, type } = req.query
  const channel = req.headers['x-channel'];
  const { Cart } = getModelsByChannel(channel, res, cartModel);
  const { User } = getModelsByChannel(channel, res, userModel);
  const { Product } = getModelsByChannel(channel, res, productModel);
  const { PromotionLimit } = getModelsByChannel(channel, res, promotionModel);
  const cart = await Cart.findOne({ type, area, storeId })
  if (!cart || cart.listProduct.length === 0) {
    return res.status(404).json({ status: 404, message: 'Cart is empty!' })
  }

  const productLimit = cart.listPromotion.map(item => {
    return {
      proId: item.proId
    }
  })
  let productLimitList = []
  for (const i of productLimit) {

    const productLimitDetail = await PromotionLimit.findOne({ proId: i.proId })
    productLimitList.push(productLimitDetail)

  }




  res.status(200).json({
    status: 200,
    message: productLimitList
  })
}
