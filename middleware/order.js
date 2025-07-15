
const { OOTYPE, NumberSeries } = require('../models/cash/master')
const { getModelsByChannel } = require('../middleware/channel')
const cartModel = require('../models/cash/cart')
const productModel = require('../models/cash/product')
const stockModel = require('../models/cash/stock')


exports.updateRunningNumber = async (data, transaction) => {
  try {
    const { coNo, lastNo, seriesType, series } = data;
    const update = await NumberSeries.update(
      { lastNo: lastNo },
      {
        where: {
          coNo: coNo,
          series: series,
          seriesType: seriesType,
        },
        transaction,
      }
    );
    return { status: 202, data: update };
  } catch (error) {
    throw console.log(error)
  }
};



exports.getSeries = async (orderType) => {
  try {
    const response = await OOTYPE.findOne({
      where: {
        OOORTP: orderType,
      },
    });
    return response;
  } catch (error) {
    throw errorEndpoint(currentFilePath, "getSeries", error);
  }
};


module.exports.formatDateTimeToThai = function (date) {
  const thDate = new Date(new Date(date).getTime() + 7 * 60 * 60 * 1000);
  const day = String(thDate.getDate()).padStart(2, '0');
  const month = String(thDate.getMonth() + 1).padStart(2, '0');
  const year = thDate.getFullYear();
  const hour = String(thDate.getHours()).padStart(2, '0');
  const minute = String(thDate.getMinutes()).padStart(2, '0');
  const second = String(thDate.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
}


module.exports.to2 = function (num) {
  return Math.round((Number(num) || 0) * 100) / 100;
}

module.exports.getQty = async function (data,channel) {
  try {
    const { area, productId, unit, period } = data
    // const channel = req.headers['x-channel']

    const { Stock } = getModelsByChannel(channel, '', stockModel)
    const { Product } = getModelsByChannel(channel, '', productModel)

    // Find product
    const product = await Product.findOne({ id: productId }).lean()

    if (!product) {
      throw new Error('Not Found This ItemId in Product collection')
    }

    const unitData = product.listUnit.map(unit => ({
      unit: unit.unit,
      factor: unit.factor
    }))

    const unitMatch = product.listUnit.find(u => u.unit === unit)
    const factor = unitMatch?.factor ?? 0

    if (!factor || factor <= 0) {
      throw new Error(`Invalid or missing factor for unit "${unit}"`)
    }

    // Find stock entries
    const stockEntries = await Stock.find({
      area,
      period,
      'listProduct.productId': productId
    })

    const stockmatchList = []

    stockEntries.forEach(item => {
      const match = item.listProduct.find(p => p.productId === productId)
      if (match) stockmatchList.push(match)
    })

    if (!stockmatchList.length) {
      throw new Error('Not Found This ItemId in Stock collection')
    }

    // Sum balancePcs
    const totalBalancePcs = stockmatchList.reduce(
      (sum, item) => sum + (item.balancePcs ?? 0),
      0
    )

    const qtyByUnit = Math.floor(totalBalancePcs / factor)

    const dataRes = {
      area,
      productId,
      unit,
      factor,
      sumQtyPcs: totalBalancePcs,
      qty: qtyByUnit,
      unitData
    }

    return dataRes



  } catch (error) {
    console.error('[getQty error]', error)
    // return res.status(500).json({
    //   status: 500,
    //   message: 'Internal server error: ' + error.message
    // })
  }





}

