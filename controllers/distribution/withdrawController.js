// const { Cart } = require('../../models/cash/cart')
// const { User } = require('../../models/cash/user')
// const { Product } = require('../../models/cash/product')
// const { Distribution, Place } = require('../../models/cash/distribution')
const axios = require('axios')
const { generateDistributionId } = require('../../utilities/genetateId')
const { rangeDate } = require('../../utilities/datetime')
const { period, previousPeriod } = require('../../utilities/datetime')
const cartModel = require('../../models/cash/cart')
const productModel = require('../../models/cash/product')
const distributionModel = require('../../models/cash/distribution')
const userModel = require('../../models/cash/user')
const stockModel = require('../../models/cash/stock')
const { withdrawQuery } = require('../../controllers/queryFromM3/querySctipt')
const { getModelsByChannel } = require('../../middleware/channel')
const { query } = require('mssql')




exports.checkout = async (req, res) => {
  try {
    const { type, area, shippingId, withdrawType, sendDate, note, period } = req.body

    const channel = req.headers['x-channel'];
    const { Cart } = getModelsByChannel(channel, res, cartModel);
    const { User } = getModelsByChannel(channel, res, userModel);
    const { Place } = getModelsByChannel(channel, res, distributionModel);
    const { Product } = getModelsByChannel(channel, res, productModel)
    const { Distribution } = getModelsByChannel(channel, res, distributionModel)
    const { Stock, StockMovementLog, StockMovement } = getModelsByChannel(channel, res, stockModel);



    if (!type || !area || !shippingId || !withdrawType || !sendDate || !note) {
      return res
        .status(400)
        .json({ status: 400, message: 'Missing required fields!' })
    }

    const cart = await Cart.findOne({ type, area })
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

    const shippingData = await Place.findOne(
      { area, 'listAddress.shippingId': shippingId },
      { 'listAddress.$': 1 }
    )

    if (!shippingData || !shippingData.listAddress.length) {
      return res
        .status(404)
        .json({ status: 404, message: 'Shipping address not found!' })
    }
    const shipping = shippingData.listAddress[0]

    const fromWarehouse =
      withdrawType === 'normal'
        ? shipping.warehouse?.normal
        : shipping.warehouse?.clearance

    if (!fromWarehouse) {
      return res
        .status(400)
        .json({
          status: 400,
          message: 'Invalid withdrawType or missing warehouse data!'
        })
    }

    // console.log("cart",cart)
    const productIds = cart.listProduct.map(p => p.id)
    const products = await Product.find({ id: { $in: productIds } }).select(
      'id name group brand size flavour weightGross weightNet listUnit'
    )

    let subtotal = 0
    let totalQty = 0
    let totalWeightGross = 0
    let totalWeightNet = 0
    let listProduct = cart.listProduct.map(item => {
      //มาเช็คตรงนี้
      const product = products.find(p => p.id === item.id)
      if (!product) return null

      const unitData = product.listUnit.find(u => u.unit === item.unit)
      if (!unitData) {
        return res
          .status(400)
          .json({ status: 400, message: `Invalid unit for product ${item.id}` })
      }

      const qtyPcs = unitData?.factor * item.qty
      const weightGross = item.qty * product.weightGross
      const weightNet = item.qty * product.weightNet
      const totalPrice = item.qty * unitData.price.sale

      subtotal += totalPrice
      totalQty += item.qty
      totalWeightGross += weightGross
      totalWeightNet += weightNet

      return {
        id: product.id,
        lot: item.lot,
        name: product.name,
        group: product.group,
        brand: product.brand,
        size: product.size,
        flavour: product.flavour,
        qty: item.qty,
        unit: item.unit,
        qtyPcs,
        price: unitData.price.sale,
        total: totalPrice,
        weightGross: parseFloat(weightGross.toFixed(2)),
        weightNet: parseFloat(weightNet.toFixed(2))
      }
    })

    // console.log(listProduct)

    if (listProduct.includes(null)) return
    // if (listProduct.some(p => p === null)) return res.status(400).json({ status: 400, message: 'Invalid product in cart!' })
    const orderId = await generateDistributionId(area, sale.warehouse, channel, res)

    const newOrder = new Distribution({
      orderId,
      orderType: shipping.type,
      orderTypeName: shipping.typeNameTH,
      area,
      fromWarehouse,
      toWarehouse: sale.warehouse,
      shippingId: shipping.shippingId,
      shippingRoute: shipping.route,
      shippingName: shipping.name,
      sendAddress: shipping.address,
      sendDate,
      remark: note,
      listProduct,
      total: subtotal,
      totalQty: totalQty,
      totalWeightGross: parseFloat(totalWeightGross.toFixed(2)),
      totalWeightNet: parseFloat(totalWeightNet.toFixed(2)),
      createdBy: sale.username,
      period: period
    })




    const productQty = newOrder.listProduct.map(u => {
      return {
        productId: u.id,
        // lot: u.lot,
        unit: u.unit,
        qty: u.qty,
        statusMovement: 'OUT'
      }
    })


    // for (const item of productQty) {
    //   const factorPcsResult = await Product.aggregate([
    //     { $match: { id: item.productId } },
    //     {
    //       $project: {
    //         id: 1,
    //         listUnit: {
    //           $filter: {
    //             input: "$listUnit",
    //             as: "unitItem",
    //             cond: { $eq: ["$$unitItem.unit", item.unit] }
    //           }
    //         }
    //       }
    //     }
    //   ]);

    //   const factorCtnResult = await Product.aggregate([
    //     { $match: { id: item.productId } },
    //     {
    //       $project: {
    //         id: 1,
    //         listUnit: {
    //           $filter: {
    //             input: "$listUnit",
    //             as: "unitItem",
    //             cond: { $eq: ["$$unitItem.unit", "CTN"] }
    //           }
    //         }
    //       }
    //     }
    //   ]);
    //   const factorCtn = factorCtnResult[0].listUnit[0].factor
    //   const factorPcs = factorPcsResult[0].listUnit[0].factor
    //   const factorPcsQty = item.qty * factorPcs
    //   const factorCtnQty = Math.floor(factorPcsQty / factorCtn);
    //   const data = await Stock.findOneAndUpdate(
    //     {
    //       area: area,
    //       period: period,
    //       'listProduct.productId': item.productId
    //     },
    //     {
    //       $inc: {
    // 'listProduct.$[elem].stockOutPcs': +factorPcsQty,
    // 'listProduct.$[elem].balancePcs': -factorPcsQty,
    // 'listProduct.$[elem].stockOutCtn': +factorCtnQty,
    // 'listProduct.$[elem].balanceCtn': -factorCtnQty
    //       }
    //     },
    //     {
    //       arrayFilters: [
    //         { 'elem.productId': item.productId }
    //       ],
    //       new: true
    //     }
    //   );
    // }











    const calStock = {
      // storeId: refundOrder.store.storeId,
      orderId: newOrder.orderId,
      area: newOrder.area,
      saleCode: sale.saleCode,
      period: period,
      warehouse: newOrder.fromWarehouse,
      status: 'pending',
      statusTH: 'รอนำเข้า',
      action: "Withdraw",
      type: "Withdraw",
      product: productQty
    }

    const createdMovement = await StockMovement.create({
      ...calStock
    });

    await StockMovementLog.create({
      ...calStock,
      refOrderId: createdMovement._id
    });


    await newOrder.save()
    await Cart.deleteOne({ type, area })

    res.status(200).json({
      status: 200,
      message: 'Checkout successful!',
      // data: { orderId, total: subtotal, qty: totalQty }
      data: newOrder
      // data:listProductWithDraw
    })
  } catch (error) {
    console.error('Error saving store to MongoDB:', error)
    res.status(500).json({ status: '500', message: 'Server Error' })
  }
}

exports.getOrder = async (req, res) => {
  try {
    const { type, area, period } = req.query
    const channel = req.headers['x-channel'];

    const { Distribution } = getModelsByChannel(channel, res, distributionModel);

    let response = []
    if (!type || !period) {
      return res
        .status(400)
        .json({ status: 400, message: 'type,  period are required!' })
    }

    const { startDate, endDate } = rangeDate(period)
    // console.log('startDate', startDate)
    // console.log('endDate', endDate)

    const status = type === 'history' ? { $ne: 'pending' } : 'pending'
    let areaQuery = {}
    if (area) {
      if (area.length == 2) {
        areaQuery.zone = area.slice(0, 2)
      }
      else if (area.length == 5) {
        areaQuery.area = area
      }
    }
    let query = {
      ...areaQuery,
      status,
      createdAt: {
        $gte: startDate,
        $lt: endDate
      }
    }
    // console.log(query)
    const order = await Distribution.aggregate([
      {
        $addFields: {
          zone: { $substrBytes: ["$area", 0, 2] }
        }
      },
      { $match: query }
    ])
    // const order = await Distribution.find(query)
    // const order2 = await Distribution.find();
    // console.log(order)
    if (order.length == 0) {
      return res
        .status(404)
        .json({ status: 404, message: 'Distribution order not found!' })
    }

    response = order.map(o => ({
      area: o.area,
      orderId: o.orderId,
      orderType: o.orderType,
      orderTypeName: o.orderTypeName,
      sendDate: o.sendDate,
      total: o.totalQty || 0,
      status: o.status,
      created: o.created
    }))

    res.status(200).json({
      status: 200,
      message: 'Successful!',
      data: response
    })
  } catch (error) {
    console.error('Error saving store to MongoDB:', error)
    res.status(500).json({ status: '500', message: 'Server Error' })
  }
}

exports.getDetail = async (req, res) => {
  try {
    const { orderId } = req.params

    const channel = req.headers['x-channel'];

    const { Distribution } = getModelsByChannel(channel, res, distributionModel);
    if (!orderId) {
      return res
        .status(400)
        .json({ status: 400, message: 'orderId is required!' })
    }

    const order = await Distribution.find({ orderId })

    if (order.length === 0) {
      return res
        .status(404)
        .json({ status: 404, message: 'Distribution order not found!' })
    }
    const data = order.map(u => {
      return {
        order: u.order,
        type: u.type,
        _id: u._id,
        orderId: u.orderId,
        orderType: u.orderType,
        orderTypeName: u.orderTypeName,
        area: u.area,
        fromWarehouse: u.fromWarehouse,
        toWarehouse: u.toWarehouse,
        shippingId: u.shippingId,
        shippingRoute: u.shippingRoute,
        shippingName: u.shippingName,
        sendAddress: u.sendAddress,
        sendDate: u.sendDate,
        remark: u.remark,
        listProduct: u.listProduct.map(p => {
          return {
            id: p.id,
            name: p.name,
            group: p.group,
            brand: p.brand,
            size: p.size,
            flavour: p.flavour,
            qty: p.qty,
            unit: p.unit,
            qtyPcs: p.qtyPcs,
            price: p.price,
            total: p.total,
            weightGross: p.weightGross,
            weightNet: p.weightNet,
            receiveQty: p.receiveQty,
            _id: p._id
          };
        }),
        total: u.total,
        totalQty: u.totalQty,
        totalWeightGross: u.totalWeightGross,
        totalWeightNet: u.totalWeightNet,
        receivetotal: u.receivetotal,
        receivetotalQty: u.receivetotalQty,
        receivetotalWeightGross: u.receivetotalWeightGross,
        receivetotalWeightNet: u.receivetotalWeightNet,
        status: u.status
      };
    });


    res.status(200).json({
      status: 200,
      message: 'successful!',
      data: data
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

    const { Distribution } = getModelsByChannel(channel, res, distributionModel);

    if (!orderId || !status) {
      return res
        .status(400)
        .json({ status: 400, message: 'orderId, status are required!' })
    }

    const order = await Distribution.findOne({ orderId })
    if (!order) {
      return res.status(404).json({ status: 404, message: 'Order not found!' })
    }

    if (order.status !== 'pending' && status !== 'canceled') {
      return res
        .status(400)
        .json({
          status: 400,
          message: 'Cannot update status, distribution is not in pending state!'
        })
    }

    let newOrderId = orderId

    if (status === 'canceled' && !orderId.endsWith('CC')) {
      newOrderId = `${orderId}CC`

      const isDuplicate = await Distribution.findOne({ orderId: newOrderId })
      if (isDuplicate) {
        let counter = 1
        while (
          await Distribution.findOne({ orderId: `${orderId}CC${counter}` })
        ) {
          counter++
        }
        newOrderId = `${orderId}CC${counter}`
      }
    }

    const updatedOrder = await Distribution.findOneAndUpdate(
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

exports.updateStockWithdraw = async (req, res) => {

  const { orderId, status } = req.body
  const channel = req.headers['x-channel'];
  const { Stock, StockMovementLog, StockMovement } = getModelsByChannel(channel, res, stockModel);

  const stockmovements = await StockMovement.findOne({ orderId: orderId, status: status })

  const productId = stockmovements.product.flatMap(u => u.productId)

  const stock = await Stock.aggregate([
    { $match: { area: stockmovements.area, period: stockmovements.period } },
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


  let listProductWithDraw = []
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
      checkQtyPcs = lot.qtyPcs + pcsQty
      checkQtyCtn = lot.qtyCtn + ctnQty


      updateLot.push({
        productId: stockDetail.productId,
        location: lot.location,
        lot: lot.lot,
        qtyPcs: Math.checkQtyPcs,
        qtyPcsStockIn: lot.qtyPcsStockIn + pcsQty,
        qtyPcsStockOut: lot.qtyPcsStockOut,
        qtyCtn: Math.checkQtyCtn,
        qtyCtnStockIn: lot.qtyCtnStockIn + ctnQty,
        qtyCtnStockOut: lot.qtyCtnStockOut
      })
    }

    const relatedLots = updateLot.filter((u) => u.productId === stockDetail.productId);
    listProductWithDraw.push({
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
  // console.log("listProductWithDraw:\n", JSON.stringify(listProductWithDraw, null, 2));
  for (const updated of listProductWithDraw) {
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


  res.status(200).json({
    status: 200,
    message: "successfully",
    stock
  })
}

exports.insertWithdrawToErp = async (req, res) => {

  const { area, period } = req.body
  const channel = req.headers['x-channel'];
  const { Distribution } = getModelsByChannel(channel, res, distributionModel);
  const distributionData = await Distribution.find({ area: area })

  let data = []
  for (const item of distributionData) {
    const sendDate = new Date(item.sendDate); // สร้าง Date object
    const formattedDate = sendDate.toISOString().slice(0, 10).replace(/-/g, ''); // "20250222"
    const MGNUGL = item.listProduct.map(i => i.id);
    const uniqueCount = new Set(MGNUGL).size;

    const dataTran = {
      Hcase: 0,
      orderNo: item.orderId,
      statusLow: '22',
      statusHigh: '22',
      orderType: item.orderType,
      tranferDate: formattedDate,
      warehouse: item.fromWarehouse,
      towarehouse: item.toWarehouse,
      routeCode: item.shippingRoute,
      addressCode: item.shippingId,
      location: '',
      MGNUGL: uniqueCount,
      MGDEPT: '',
      remark: '',
      item: item.listProduct.map(u => {
        return {
          itemCode: u.id,
          itemStatus: '22',
          MRWHLO: item.fromWarehouse,
          itemQty: u.qty,
          itemUnit: u.unit,
          toLocation: '',
          itemLot: '',
          location: '',
          itemLocation: ''
        }
      })
    }
    data.push(dataTran)
  }

  const response = await axios.post(
    `${process.env.API_URL_12ERP}/distribution/insertdistribution`,
    data
  );

  res.status(200).json({
    status: 200,
    message: 'successfully',
    data
  })
}


exports.insertOneWithdrawToErp = async (req, res) => {

  const { orderId } = req.body
  const channel = req.headers['x-channel'];
  const { Distribution } = getModelsByChannel(channel, res, distributionModel);
  const distributionData = await Distribution.find({ orderId: orderId })

  let data = []
  for (const item of distributionData) {
    const sendDate = new Date(item.sendDate); // สร้าง Date object
    const formattedDate = sendDate.toISOString().slice(0, 10).replace(/-/g, ''); // "20250222"
    const MGNUGL = item.listProduct.map(i => i.id);
    const uniqueCount = new Set(MGNUGL).size;

    const dataTran = {
      Hcase: 1,
      orderNo: item.orderId,
      statusLow: '22',
      statusHigh: '22',
      orderType: item.orderType,
      tranferDate: formattedDate,
      warehouse: item.fromWarehouse,
      towarehouse: item.toWarehouse,
      routeCode: item.shippingRoute,
      addressCode: item.shippingId,
      location: '',
      MGNUGL: uniqueCount,
      MGDEPT: '',
      remark: '',
      items: item.listProduct.map(u => {
        return {
          itemCode: u.id,
          itemStatus: '22',
          MRWHLO: item.fromWarehouse,
          itemQty: u.qty,
          itemUnit: u.unit,
          toLocation: '',
          itemLot: '',
          location: '',
          itemLocation: ''
        }
      })
    }
    data.push(dataTran)
  }

  const response = await axios.post(
    `${process.env.API_URL_12ERP}/distribution/insertdistribution`,
    data
  );

  res.status(200).json({
    status: 200,
    message: 'successfully',
    data
  })
}



exports.addFromERPWithdraw = async (req, res) => {
  const channel = req.headers['x-channel'];
  const result = withdrawQuery(channel)



  res.status(200).json({
    status: 200,
    message: 'successfully',
    data: result
  })
}

exports.approveWithdraw = async (req, res) => {
  const { orderId } = req.query

  const channel = req.headers['x-channel'];
  const { Distribution } = getModelsByChannel(channel, res, distributionModel);
  const distributionData = await Distribution.findOneAndUpdate(
    { orderId: orderId, type: 'withdraw' },
    { $set: { statusTH: 'completed', status: 'สำเร็จ' } },
    { new: true }
  );

  if (!distributionData) {
    return res.status(404).json({
      status: 404,
      message: 'Not found withdraw'
    });
  }

  res.status(200).json({
    status: 200,
    message: 'successfully',
    data: distributionData
  })

}