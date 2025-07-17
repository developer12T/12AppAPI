const userModel = require('../../models/cash/user')
const ExcelJS = require('exceljs')
const path = require('path')
const os = require('os')
const fs = require('fs')
const orderModel = require('../../models/cash/sale')
const storeModel = require('../../models/cash/store')
const routeModel = require('../../models/cash/route')
const refundModel = require('../../models/cash/refund')
const DistributionModel = require('../../models/cash/distribution')
const promotionModel = require('../../models/cash/promotion')
const sendMoneyModel = require('../../models/cash/sendmoney')
const stockModel = require('../../models/cash/stock')
const productModel = require('../../models/cash/product')
const { to2, getQty, updateStockMongo, getPeriodFromDate } = require('../../middleware/order')

const typeTruckModel = require('../../models/cash/typetruck')
const { getModelsByChannel } = require('../../middleware/channel')
const { Item } = require('../../models/cash/master')

exports.utilize = async (req, res) => {
  const { area, period, typetruck } = req.body
  const channel = req.headers['x-channel']
  const { Product } = getModelsByChannel(channel, res, productModel)
  const { Typetrucks } = getModelsByChannel(channel, res, typeTruckModel)
  const { Stock } = getModelsByChannel(channel, res, stockModel)
  const { Distribution } = getModelsByChannel(channel, res, DistributionModel)




  const dataStock = await Stock.findOne({ area: area, period: period })
  const productIds = dataStock.listProduct.flatMap(item => {
    return item.productId;
  });




  const dataTypetrucks = await Typetrucks.findOne({ type_name: typetruck })
  const datawithdraw = await Distribution.find({ area: area, period: period, status: 'pending' })

  const withdrawProductIds = datawithdraw.flatMap(item =>
    item.listProduct.map(u => u.id)
  );
  const withdrawProduct = datawithdraw.flatMap(item =>
    item.listProduct.map(u => ({
      id: u.id,
      qtyPcs: u.qtyPcs
    }))
  );
  // console.log(withdrawProductIds)
  const allProductIds = [...productIds, ...withdrawProductIds];
  const dataProduct = await Product.find({ id: { $in: allProductIds } })



  // console.log(withdrawProduct)
  let stock = 0;
  let withdraw = 0;

  for (const item of allProductIds) {
    const stockItem = dataStock.listProduct.find(u => u.productId === item);
    const productItem = dataProduct.find(u => u.id === item);
    // console.log(item)
    // เช็คว่าหาเจอหรือไม่ (ป้องกัน error)
    if (!stockItem || !productItem) continue;

    const dataStockPcs = stockItem.balancePcs;
    const productNet = productItem.weightNet;

    stock += dataStockPcs * productNet;


    const withdrawTotalQty = withdrawProduct
      .filter(u => u.id === item)
      .reduce((sum, u) => sum + (u.qtyPcs || 0), 0);
    // console.log(withdrawProductPcsObj)
    // ถ้าไม่เจอ หรือไม่มี qtyPcs ให้ข้าม
    // if (!withdrawProductPcsObj || withdrawProductPcsObj.qtyPcs === undefined) {
    //   continue;
    // }

    withdraw += withdrawTotalQty * productNet;
  }

  stock = stock / 1000
  withdraw = withdraw / 1000

  const sum = stock + withdraw
  const net = dataTypetrucks.weight
  const payload = dataTypetrucks.payload
  const free = dataTypetrucks.payload - sum

  // console.log(stock)



  const data = {
    freePercentage: to2((free * 100) / payload),
    stocklPercentage: to2((stock * 100) / payload),
    withdrawPercentage: to2((withdraw * 100) / payload),
    sumPercentage: to2(sum / payload),
    free: to2(free),
    stock: to2(stock),
    wtihdraw: to2(withdraw),
    sum: to2(sum),
    type_name: dataTypetrucks.type_name,
    // weight: dataTypetrucks.weight,
    total_weight: dataTypetrucks.total_weight,
    law_weight: dataTypetrucks.law_weight,
    height_floor: dataTypetrucks.height_floor,
    width_floor: dataTypetrucks.width_floor,
    length_floor: dataTypetrucks.length_floor,
    front_pressure: dataTypetrucks.front_pressure,
    back_pressure: dataTypetrucks.back_pressure,
    set_speed: dataTypetrucks.set_speed,
    set_speed_city: dataTypetrucks.set_speed_city,
    net: to2(net),
    payload: payload

  }



  res.status(200).json({
    status: '200',
    message: 'utilize fetched successfully!',
    data: data
  })
}