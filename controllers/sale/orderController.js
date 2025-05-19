// const { Order } = require('../../models/cash/sale')
// const { Cart } = require('../../models/cash/cart')
// const { User } = require('../../models/cash/user')
// const { Product } = require('../../models/cash/product')
// const { Route } = require('../../models/cash/route')


const { Warehouse,Locate,Balance,Sale } = require('../../models/cash/master')
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
const path = require('path')
const upload = multer({ storage: multer.memoryStorage() }).single('image')
const os = require('os')
const xlsx = require('xlsx')
const _ = require('lodash')
const { DateTime } = require("luxon");
const { getSocket } = require('../../socket')


const stockModel = require('../../models/cash/stock')
const orderModel  = require('../../models/cash/sale')
const cartModel  = require('../../models/cash/cart')
const userModel  = require('../../models/cash/user')
const productModel  = require('../../models/cash/product')
const routeModel = require('../../models/cash/route')
const storeModel = require('../../models/cash/store');
const { getModelsByChannel } = require('../../middleware/channel')

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

    const { Cart } = getModelsByChannel(channel,res,cartModel); 
    const { User } = getModelsByChannel(channel,res,userModel); 
    const { Product } = getModelsByChannel(channel,res,productModel); 
    const { Order } = getModelsByChannel(channel,res,orderModel); 
    const { Stock } = getModelsByChannel(channel,res,stockModel); 


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
    if (changePromotionStatus == 0) {
      summary = await summaryOrder(cart,channel,res)
    } else if (changePromotionStatus == 1) {
      summary = await summaryOrderProStatusOne(cart, listPromotion,channel,res)
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
      const orderId = await generateOrderId(area, sale.warehouse,channel,res)

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
        vat: 0,
        totalExVat: 0,
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

        const calStock = {
            // storeId: refundOrder.store.storeId,
            area: newOrder.store.area,
            period: period,
            type: "Sale",
            listProduct: newOrder.listProduct.map(u => {
                return {
                    id: u.id,
                    lot: u.lot,
                    unit: u.unit,
                    qty: u.qty,
                }
            })
        }
        // console.log("newOrder.listProduct",newOrder.listProduct)

        const productId = calStock.listProduct.flatMap(u => u.id)

        const stock = await Stock.aggregate([
            { $match: { area: area, period: period } },
            { $unwind: { path: '$listProduct', preserveNullAndEmptyArrays: true } },
            { $match: { "listProduct.id": { $in: productId } } },
            // { $match : { "listProduct.available.lot": u.lot } },
            {
                $project: {
                    _id: 0,
                    id: "$listProduct.id",
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

                const calDetails = calStock.listProduct.filter(
                    u => u.id === stockDetail.id && u.lot === lot.lot
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

                updateLot.push({
                    id: stockDetail.id,
                    location: lot.location,
                    lot: lot.lot,
                    qtyPcs: lot.qtyPcs - pcsQty,
                    qtyPcsStockIn: lot.qtyPcsStockIn ,
                    qtyPcsStockOut: lot.qtyPcsStockOut + pcsQty,
                    qtyCtn: lot.qtyCtn - ctnQty,
                    qtyCtnStockIn: lot.qtyCtnStockIn ,
                    qtyCtnStockOut: lot.qtyCtnStockOut + ctnQty
                })
            }
            const relatedLots = updateLot.filter((u) => u.id === stockDetail.id);
            listProductStock.push({
                id: stockDetail.id,
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
                { arrayFilters: [{ "product.id": updated.id }], new: true }
            )
        }




      await newOrder.save()
      // await Cart.deleteOne({ type, area, storeId })

      const checkIn = await checkInRoute({
        storeId: storeId,
        routeId: routeId,
        orderId: orderId,
        note: note,
        latitude: latitude,
        longitude: longitude
      },channel,res)

      res.status(200).json({
        status: 200,
        message: 'Checkout successful!',
        data: newOrder
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


    const { Order } = getModelsByChannel(channel,res,orderModel); 



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
        'orderId store.createdAt store.storeId store.name store.address total status'
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
      status: o.status
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


    const { Order } = getModelsByChannel(channel,res,orderModel); 

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


    const { Order } = getModelsByChannel(channel,res,orderModel); 


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

    const { Order } = getModelsByChannel(channel,res,orderModel); 

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
  const { saleCode } = req.params

  const channel = req.headers['x-channel'];
  const { Order } = getModelsByChannel(channel,res,orderModel); 


  // console.log(saleCode)
  const modelOrder = await Order.find({
    orderId: { $not: /CC/ },
  })
  

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
        OBSMCD: saleCode,
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

  const ws = xlsx.utils.json_to_sheet(tranFromOrder)

  const downloadsPath = path.join(os.homedir(), 'Downloads', 'Order.xlsx')

  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws, 'Orders')

  xlsx.writeFile(wb, downloadsPath)

  console.log('✅ ไฟล์ Order.xlsx ถูกสร้างแล้วที่:', downloadsPath)

  res.status(200).json({
    message: 'Create file successful!'
  })
}

exports.getAllOrder = async (req, res) => {
  try {
    const { period } = req.query

    const channel = req.headers['x-channel'];

    const { Order } = getModelsByChannel(channel,res,orderModel); 

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
          status:404,
          message:"Not Found Order"
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


    const { Product } = getModelsByChannel(channel,res,productModel); 
    const { Order } = getModelsByChannel(channel,res,orderModel); 


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
      status:404,
      message: 'Not Found Product'
    })
  }

  const data = products.map(product => {
    const netTotal = modelOrder.find(order => order.listProduct.id === product.id);
    return {
              id:product.id,
              groupCode:product.groupCode,
              brandCode:product.brandCode,
              flavourCode:product.flavourCode,
              size:product.size,
              netTotal:netTotal.listProduct.netTotal
    }
  })

  if ( !type ) {
    return res.status(404).json({
      status:404,
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
    else if (type == "flavour"){
     
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

    else if (type == "size"){
     
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

    else if (type == "brand"){
     
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

    const { Route } = getModelsByChannel(channel,res,routeModel); 



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
  const { area, year,storeId,day  } = req.query
  const channel = req.headers['x-channel']; // 'credit' or 'cash'

  const { Store } = getModelsByChannel(channel,res,storeModel); 
  const { Route } = getModelsByChannel(channel,res,routeModel); 

  checkArea = await Route.find({ area: area })

  // if (checkArea.length == 0) {
  //   return res.status(404).json({
  //     status: 404,
  //     message: `Not Found This area: ${area}`
  //   })
  // }

  const storeIdObj = await Store.findOne({storeId:storeId}).select("_id")

  const matchStore = storeIdObj
  ? {
      "listStore.storeInfo": {
        $exists: true,
        $eq: storeIdObj._id.toString()
      }
    }
  : {};

  const pipeline = [
    { $match: { area } },
    { $unwind: { path: '$listStore', preserveNullAndEmptyArrays: true } },
    { $match: matchStore },
    {
      $unwind: {
        path: '$listStore.listOrder',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $lookup: {
        from: 'orders',
        localField: 'listStore.listOrder.orderId',
        foreignField: 'orderId',
        as: 'orderDetails'
      }
    },
    { $unwind: { path: '$orderDetails', preserveNullAndEmptyArrays: true } },
    {
      $match: {
        orderDetails: { $ne: null },
        'orderDetails.createdAt': { $ne: null }
      }
    },
    {
      $addFields: {
        createdAtThai: {
          $dateAdd: {
            startDate: '$orderDetails.createdAt',
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
  ]
  
  if (day != null) {
    pipeline.push({
      $match: {
        createdDay: Number(day)
      }
    })
  }

  if (year != null) {
    pipeline.push({
      $match: {
        createdYear: Number(year)
      }
    })
  }

  pipeline.push(
    {
      $project: {
        month: { $month: '$createdAtThai' },
        total: '$orderDetails.total'
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
  
  const modelRoute = await Route.aggregate(pipeline)
  

  // console.log(JSON.stringify(modelRoute, null, 2));


  modelRouteValue = modelRoute.map(item => {
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
  modelRouteValue.forEach(d => {
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
  const { period, year } = req.query

  const channel = req.headers['x-channel']; // 'credit' or 'cash'

  const { Route } = getModelsByChannel(channel,res,routeModel); 

  if (!period) {
    return res.status(404).json({
      status:404,
      message:"period is require" 
    })
  }


    const modelRouteValue = await Route.aggregate([
      { $match: { period: period } },
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
          }
      }},
          {
        $match: {
          $expr: {
            $cond: {
              if: { $eq: [year, null] }, 
              then: true, 
              else: {
                $eq: [
                  { $substr: [{ $toString: "$convertedDate" }, 0, 4] }, 
                  { $toString: year } 
                ]
              }
            }
          }
        }
      },
      {
        $lookup: {
          from: "orders",
          localField: "listStore.listOrder.orderId",
          foreignField: "orderId",
          as: "orderDetails",
        }
      },
      { $unwind: { path: "$orderDetails", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { area: "$area", day: "$day" },
          totalAmount: { $sum: "$orderDetails.total" }
        }
      },
      {
        $project: {
          area: "$_id.area",
          day: "$_id.day",
          totalAmount: 1,
          _id: 0
        }
      },
      { $sort: { area: 1, day: 1 } }
    ]);

    
    const haveArea = [...new Set(modelRouteValue.map(i => i.area))];
    otherModelRoute = await Route.aggregate([
      {
        $match: {
          period: period,
          area: { $nin: haveArea }  // เลือกเฉพาะ area ที่ไม่อยู่ใน haveArea
        }
      },
      { $project: { area: 1, day: 1, listStore: 1 } },
      { $unwind: { path: "$listStore", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$listStore.listOrder", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "orders",
          localField: "listStore.listOrder.orderId",
          foreignField: "orderId",
          as: "orderDetails",
        }
      },
      { $unwind: { path: "$orderDetails", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { area: "$area", day: "$day" },  
          totalAmount: { $sum: "$orderDetails.total" }  
        }
      },
      {
        $project: {
          area: "$_id.area", 
          day: "$_id.day",
          totalAmount: 1, 
          _id: 0
        }
      },
      { $sort: { area: 1, day: 1 } }
    ]);

    if (modelRouteValue.length === 0) {
      return res.status(404).json({
        status: 404,
        message: 'Not Found Route This period'
      })
    }
    modelRoute = [...modelRouteValue, ...otherModelRoute];
    const areaList = [...new Set(modelRoute.map(item => item.area))].sort();
    const data = areaList.map(area => {
      const filtered = modelRoute.filter(item => item.area === area);
      const filledDays = Array.from({ length: 27 }, (_, i) => {
        const day = String(i + 1).padStart(2, '0');
        const found = filtered.find(item => item.day === day);
        return found || {
          totalAmount: 0,
          area: area,
          day: day,
        };
      });
      return {
        area: area,
        summary: filledDays.map(item => item.totalAmount),
      };
    });
    res.status(200).json({
      status: 200,
      message: 'Success',
      data: data
    })

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Internal server error.' })
  }
}


exports.getSummarybyGroup = async (req, res) => {
try {
    const { zone,group,period } = req.body 

    const channel = req.headers['x-channel']; // 'credit' or 'cash'

    const { Order } = getModelsByChannel(channel,res,orderModel); 
    const { Product } = getModelsByChannel(channel,res,productModel); 


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

    const order = modelOrder.map( u => {
      return {
        id:u.listProduct.id,
        groupCode:u.listProduct.groupCode,
        size:u.listProduct.size,
        flavourCode:u.listProduct.flavourCode,
        qty:u.listProduct.qty

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
      status:200,
      message:'Success',
      data:modelProduct
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Internal server error.' })
  }
}

exports.erpApiCheck = async (req, res) => {
  try {

    const channel = req.headers['x-channel']; 

    const { Order } = getModelsByChannel(channel,res,orderModel); 


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
      status:404,
      message:'No new orders found in the M3 system'
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
      message:'Update status Sucess'
  }
  )



} catch (error) {
  console.error(error)
  res.status(500).json({ message: 'Internal server error.' })
}
}
