
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

module.exports.getQty = async function (data, channel) {
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

module.exports.getPeriodFromDate = function (createdAt) {
  // รับได้ทั้ง string และ Date object
  const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
};



async function checkProductInStock(Stock, area, period, id) {
  const stock = await Stock.findOne({
    area: area,
    period: period,
    'listProduct.productId': id
  });
  return !!stock;
}




module.exports.updateStockMongo = async function (data, area, period, type, channel, stockType = '') {

  const { id, unit, qty, condition } = data

  const { Stock } = getModelsByChannel(channel, '', stockModel)
  const { Product } = getModelsByChannel(channel, '', productModel)
  if (!id || !unit || !qty || !area || !period) {
    throw new Error('Missing product data (id/unit/qty/area/period)');
  }
  const factorPcsResult = await Product.aggregate([
    { $match: { id: id } },
    {
      $project: {
        id: 1,
        listUnit: {
          $filter: {
            input: '$listUnit',
            as: 'unitItem',
            cond: { $eq: ['$$unitItem.unit', unit] }
          }
        }
      }
    }
  ])
  // console.log(factorPcsResult)
  const factorCtnResult = await Product.aggregate([
    { $match: { id: id } },
    {
      $project: {
        id: 1,
        listUnit: {
          $filter: {
            input: '$listUnit',
            as: 'unitItem',
            cond: { $eq: ['$$unitItem.unit', 'CTN'] }
          }
        }
      }
    }
  ])
  const factorCtn = factorCtnResult?.[0]?.listUnit?.[0]?.factor || 0;
  const factorPcs = factorPcsResult?.[0]?.listUnit?.[0]?.factor || 0;
  const factorPcsQty = qty * factorPcs
  const factorCtnQty = factorCtn > 0
    ? Math.floor(factorPcsQty / factorCtn)
    : 0;

  if (factorPcs === 0) throw new Error('Cannot find product unit factor for PCS')
  // ปรับให้ throw ถ้า type ไม่ถูกต้อง
  if (!['sale', 'withdraw', 'give', 'deleteCart', 'orderCanceled', 'adjust', 'addproduct', 'refund', 'rufundCanceled'].includes(type))
    throw new Error('Invalid stock update type: ' + type)


  // console.log('factorPcsQty', factorPcsQty)
  // console.log('factorCtnQty', factorCtnQty)
  if (type === 'sale') {
    const found = await checkProductInStock(Stock, area, period, id);
    if (!found) throw new Error(`Product id:${id} not found in stock for area:${area} period:${period}`);
    try {
      await Stock.findOneAndUpdate(
        {
          area: area,
          period: period,
          'listProduct.productId': id
        },
        {
          $inc: {
            'listProduct.$[elem].stockOutPcs': +factorPcsQty,
            // 'listProduct.$[elem].balancePcs': -factorPcsQty,
            'listProduct.$[elem].stockOutCtn': +factorCtnQty
            // 'listProduct.$[elem].balanceCtn': -factorCtnQty
          }
        },
        {
          arrayFilters: [{ 'elem.productId': id }],
          new: true
        }
      )
    } catch (err) {
      throw new Error('Error updating stock for sale: ' + err.message)
    }

  } else if (type === 'withdraw') {
    // console.log(factorPcsQty)
    try {
      const existsProduct = await Stock.aggregate([
        {
          $match: {
            area: area,
            period: period,
            'listProduct.productId': id
          }
        }
      ]);

      if (existsProduct.length > 0) {
        await Stock.findOneAndUpdate(
          {
            area: area,
            period: period,
            'listProduct.productId': id
          },
          {
            $inc: {
              'listProduct.$[elem].stockInPcs': +factorPcsQty,
              'listProduct.$[elem].stockInCtn': +factorCtnQty,
              'listProduct.$[elem].balancePcs': +factorPcsQty,
              'listProduct.$[elem].balanceCtn': +factorCtnQty
            }
          },
          {
            arrayFilters: [{ 'elem.productId': id }],
            new: true
          }
        );
      } else {

        const newProduct = {
          productId: id,
          stockPcs: 0,
          stockInPcs: factorPcsQty,
          stockOutPcs: 0,
          balancePcs: factorPcsQty,
          stockCtn: 0,
          stockInCtn: factorCtnQty,
          stockOutCtn: 0,
          balanceCtn: factorCtnQty
        };

        await Stock.findOneAndUpdate(
          { area: area, period: period },
          { $push: { listProduct: newProduct } },
          { upsert: true, new: true }
        );
      }
    } catch (err) {
      throw new Error('Error updating stock for sale: ' + err.message)
    }
  } else if (type === 'give') {
    const found = await checkProductInStock(Stock, area, period, id);
    if (!found) throw new Error(`Product id:${id} not found in stock for area:${area} period:${period}`);
    try {
      await Stock.findOneAndUpdate(
        {
          area: area,
          period: period,
          'listProduct.productId': id
        },
        {
          $inc: {
            'listProduct.$[elem].stockOutPcs': +factorPcsQty,
            // 'listProduct.$[elem].balancePcs': -factorPcsQty,
            'listProduct.$[elem].stockOutCtn': +factorCtnQty
            // 'listProduct.$[elem].balanceCtn': -factorCtnQty
          }
        },
        {
          arrayFilters: [{ 'elem.productId': id }],
          new: true
        }
      )
    } catch (err) {
      throw new Error('Error updating stock for sale: ' + err.message)
    }
  } else if (type === 'deleteCart') {
    const found = await checkProductInStock(Stock, area, period, id);
    if (!found) throw new Error(`Product id:${id} not found in stock for area:${area} period:${period}`);
    try {
      await Stock.findOneAndUpdate(
        {
          area: area,
          period: period,
          'listProduct.productId': id
        },
        {
          $inc: {
            'listProduct.$[elem].balancePcs': +factorPcsQty,
            'listProduct.$[elem].balanceCtn': +factorCtnQty
          }
        },
        {
          arrayFilters: [{ 'elem.productId': id }],
          new: true,
        }
      )
    } catch (err) {
      throw new Error('Error updating stock for sale: ' + err.message)
    }
  } else if (type === 'orderCanceled') {
    try {
      await Stock.findOneAndUpdate(
        {
          area: area,
          period: period,
          'listProduct.productId': id
        },
        {
          $inc: {
            'listProduct.$[elem].stockOutPcs': -factorPcsQty,
            'listProduct.$[elem].balancePcs': +factorPcsQty,
            'listProduct.$[elem].stockOutCtn': -factorCtnQty,
            'listProduct.$[elem].balanceCtn': +factorCtnQty
          }
        },
        {
          arrayFilters: [{ 'elem.productId': id }],
          new: true
          // session
        }
      )
    } catch (err) {
      throw new Error('Error updating stock for sale: ' + err.message)
    }
  } else if (type === 'adjust') {
    const found = await checkProductInStock(Stock, area, period, id);
    if (!found) throw new Error(`Product id:${id} not found in stock for area:${area} period:${period}`);
    try {
      if (stockType === 'IN') {
        // console.log(factorPcsQty)
        await Stock.findOneAndUpdate(
          {
            area: area,
            period: period,
            'listProduct.productId': id
          },
          {
            $inc: {
              // 'listProduct.$[elem].stockInPcs': +factorPcsQty,
              'listProduct.$[elem].balancePcs': +factorPcsQty,
              // 'listProduct.$[elem].stockInCtn': +factorCtnQty,
              'listProduct.$[elem].balanceCtn': +factorCtnQty
            }
          },
          {
            arrayFilters: [{ 'elem.productId': id }],
            new: true
            // session
          }
        )
      } else if (stockType === 'OUT') {
        // console.log('out')
        await Stock.findOneAndUpdate(
          {
            area: area,
            period: period,
            'listProduct.productId': id
          },
          {
            $inc: {
              // 'listProduct.$[elem].stockOutPcs': +factorPcsQty,
              'listProduct.$[elem].balancePcs': -factorPcsQty,
              // 'listProduct.$[elem].stockOutCtn': +factorCtnQty,
              'listProduct.$[elem].balanceCtn': -factorCtnQty
            }
          },
          {
            arrayFilters: [{ 'elem.productId': id }],
            new: true
            // session
          }
        )
      }


    } catch (err) {
      throw new Error('Error updating stock for sale: ' + err.message)
    }
  } else if (type === 'addproduct') {
    const found = await checkProductInStock(Stock, area, period, id);
    if (!found) throw new Error(`Product id:${id} not found in stock for area:${area} period:${period}`);
    try {
      await Stock.findOneAndUpdate(
        {
          area: area,
          period: period,
          'listProduct.productId': id
        },
        {
          $inc: {
            // 'listProduct.$[elem].stockOutPcs': +factorPcsQty,
            'listProduct.$[elem].balancePcs': -factorPcsQty,
            // 'listProduct.$[elem].stockOutCtn': +factorCtnQty
            'listProduct.$[elem].balanceCtn': -factorCtnQty
          }
        },
        {
          arrayFilters: [{ 'elem.productId': id }],
          new: true
        }
      )
    } catch (err) {
      throw new Error('Error updating stock for sale: ' + err.message)
    }
  }
  else if (type === 'rufund') {
    const found = await checkProductInStock(Stock, area, period, id);
    if (!found) throw new Error(`Product id:${id} not found in stock for area:${area} period:${period}`);
    if (condition !== 'good') {
      return;
    }

    try {
      await Stock.findOneAndUpdate(
        {
          area: area,
          period: period,
          'listProduct.productId': id
        },
        {
          $inc: {
            'listProduct.$[elem].stockInPcs': +factorPcsQty,
            'listProduct.$[elem].balancePcs': +factorPcsQty,
            'listProduct.$[elem].stockInCtn': +factorCtnQty,
            'listProduct.$[elem].balanceCtn': +factorCtnQty
          }
        },
        {
          arrayFilters: [{ 'elem.productId': id }],
          new: true
        }
      )
    } catch (err) {
      throw new Error('Error updating stock for sale: ' + err.message)
    }

  } else if (type === 'rufundCanceled') {
    const found = await checkProductInStock(Stock, area, period, id);
    if (!found) throw new Error(`Product id:${id} not found in stock for area:${area} period:${period}`);

    try {
      await Stock.findOneAndUpdate(
        {
          area: area,
          period: period,
          'listProduct.productId': id
        },
        {
          $inc: {
            // 'listProduct.$[elem].stockInPcs': +factorPcsQty,
            'listProduct.$[elem].balancePcs': +factorPcsQty,
            // 'listProduct.$[elem].stockInCtn': +factorCtnQty,
            'listProduct.$[elem].balanceCtn': +factorCtnQty
          }
        },
        {
          arrayFilters: [{ 'elem.productId': id }],
          new: true
        }
      )
    } catch (err) {
      throw new Error('Error updating stock for sale: ' + err.message)
    }
  }


}