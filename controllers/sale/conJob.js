const cron = require('node-cron')
// const { erpApiCheckOrder,erpApiCheckDisributionM3 } = require('../../controllers/sale/orderController')
const { OrderToExcelConJob } = require('../../controllers/sale/orderController')


const { Warehouse, Locate, Balance, Sale, DisributionM3 } = require('../../models/cash/master')
const fs = require('fs');

const { sequelize, DataTypes } = require('../../config/m3db')
const { getSocket } = require('../../socket')

const disributionModel = require('../../models/cash/distribution')
const cartModel = require('../../models/cash/cart')
const orderModel = require('../../models/cash/sale')
const { getModelsByChannel } = require('../../middleware/channel')
const { create } = require('lodash')

async function erpApiCheckOrderJob(channel = 'cash') {
  try {
    const { Order } = getModelsByChannel(channel, null, orderModel);

    const modelSale = await Sale.findAll({
      attributes: [
        'OAORNO',
        [sequelize.fn('COUNT', sequelize.col('OAORNO')), 'count']
      ],
      group: ['OAORNO']
    });

    const saleId = modelSale.map(row => row.get('OAORNO'));
    const cleanSaleId = saleId
      .map(s => (typeof s === 'string' ? s.trim() : s))
      .filter(s => s && s.length > 0);

    // const notInModelOrder = await Order.find({
    //   orderId: { $nin: cleanSaleId }
    // }).select('orderId');
    // console.log(cleanSaleId)
    // const dataOrder = await Order.find()
    // const updateResult = await Order.updateMany(
    //   { orderId: { $in: cleanSaleId } },
    //   { $set: { status: 'success' } }
    // );

    let updatedCount = 0

    for (const id of cleanSaleId) {
      try {
        const result = await Order.updateOne(
          { orderId: id },
          { $set: { status: 'success' } }
        );
        if (result.modifiedCount > 0) {
          updatedCount++
        }
        // ถ้าอยาก log ดูเป็นรายตัว
        // console.log(`orderId: ${id}, modified: ${result.modifiedCount}`);
      } catch (err) {
        console.error(`Error update orderId: ${id}`, err);
      }
    }

    if (updatedCount === 0) {
      console.log('No new order found in the M3 system');
      return { updated: false, updatedCount: 0 };
    } else {
      console.log(`Updated ${updatedCount} order(s)`);

      const io = getSocket();
      const events = [
        'sale_getSummarybyArea',
        'sale_getSummarybyMonth',
        'sale_getSummarybyRoute',
        'sale_getSummaryItem',
        'sale_getSummarybyGroup',
        'sale_getRouteCheckinAll',
        'sale_getTimelineCheckin',
        'sale_routeTimeline'
      ];

      events.forEach(event => {
        io.emit(event, {
          status: 200,
          message: 'New Update Data',
          updatedCount: updateResult.modifiedCount
        });
      });

      return { updated: true, updatedCount };
    }
    // Broadcast


    // return {
    //   updated: true,
    //   updatedCount: updateResult.modifiedCount
    // };
  } catch (error) {
    console.error('❌ Error in erpApiCheckOrderJob:', error);
    return { error: true, message: error.message };
  }
}


async function erpApiCheckDisributionM3Job(channel = 'cash') {
  try {
    // const { Order } = getModelsByChannel(channel, null, orderModel);
    const { Distribution } = getModelsByChannel(channel, null, disributionModel);

    const modelSale = await DisributionM3.findAll({
      attributes: [
        'MGTRNR',
        [sequelize.fn('COUNT', sequelize.col('MGTRNR')), 'count']
      ],
      group: ['MGTRNR']
    });

    const orderIdList = modelSale.map(row => row.get('MGTRNR'));
    // console.log(orderIdList)
    const updateResult = await Distribution.updateMany(
      { orderId: { $in: orderIdList } },
      { $set: { status: 'success' } }
    );

    if (updateResult.modifiedCount === 0) {
      console.log('No new order Distribution found in the M3 system');
      return { updated: false, updatedCount: 0 };
    }

    // console.log('✅ Updated Distribution Order IDs:', orderIdList);

    const io = getSocket();
    const events = [
      'sale_getSummarybyArea',
      'sale_getSummarybyMonth',
      'sale_getSummarybyRoute',
      'sale_getSummaryItem',
      'sale_getSummarybyGroup',
      'sale_getRouteCheckinAll',
      'sale_getTimelineCheckin',
      'sale_routeTimeline'
    ];

    events.forEach(event => {
      io.emit(event, {
        status: 200,
        message: 'New Update Data',
        updatedCount: updateResult.modifiedCount
      });
    });

    return {
      updated: true,
      updatedCount: updateResult.modifiedCount
    };

  } catch (error) {
    console.error('❌ Error in erpApiCheckDisributionM3Job:', error);
    return { error: true, message: error.message };
  }
}

async function DeleteCartDaily(channel = 'cash') {
  try {
    const { Cart } = getModelsByChannel(channel, null, cartModel);

    const now = new Date();
    // หา "เมื่อวาน" (เวลาไทย)
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

    // สร้างช่วงเวลาเมื่อวาน (เวลาไทย)
    const yyyy = yesterday.getFullYear();
    const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
    const dd = String(yesterday.getDate()).padStart(2, '0');
    const startStr = `${yyyy}-${mm}-${dd}T00:00:00.000+07:00`;
    const endStr = `${yyyy}-${mm}-${dd}T23:59:59.999+07:00`;

    const startUtc = new Date(startStr);
    const endUtc = new Date(endStr);

    const result = await Cart.deleteMany({
      createdAt: { $gte: startUtc, $lte: endUtc }
    });

    console.log(`[DeleteCartDaily] Deleted cart for date ${yyyy}-${mm}-${dd} (ไทย) | count: ${result.deletedCount}`);

  } catch (error) {
    console.error('❌ Error in DeleteCartDaily:', error);
    return { error: true, message: error.message };
  }
}



const startCronJobErpApiCheck = () => {
  cron.schedule('*/10 * * * *', async () => {
    console.log('Running cron job startCronJobErpApiCheck every 10 minutes')
    await erpApiCheckOrderJob()
  })
}

const startCronJobErpApiCheckDisribution = () => {
  cron.schedule('*/10 * * * *', async () => {
    console.log('Running cron job startCronJobErpApiCheckDisribution every 10 minutes')
    await erpApiCheckDisributionM3Job()
  })
}

const startCronJobDeleteCartDaily = () => {
  cron.schedule('0 0 * * *', async () => {
    console.log('Running cron job DeleteCartDaily at 01:00 every day');
    await DeleteCartDaily();
  });
}


module.exports = {
  startCronJobErpApiCheck,
  // startCronJobOrderToExcel
  startCronJobErpApiCheckDisribution,
  startCronJobDeleteCartDaily
};