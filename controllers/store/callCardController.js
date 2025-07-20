const callCardModel = require('../../models/cash/callcard')
const storeModel = require('../../models/cash/store')
const saleModel = require('../../models/cash/sale')
const modelStock = require('../../models/cash/stock')
const modelProduct = require('../../models/cash/product')
const modelSendMoney = require('../../models/cash/sendmoney')
const { getModelsByChannel } = require('../../middleware/channel')
const { rangeDate } = require('../../utilities/datetime')
const { getSocket } = require('../../socket')


exports.getCallCard = async (req, res) => {
  try {
    const { area, period, storeId } = req.query
    const channel = req.headers['x-channel']
    const { CallCard } = getModelsByChannel(channel, res, callCardModel)

    let query = {}
    if (area) { query.area = area }
    if (period) { query.period = period }
    if (storeId) { query.storeId = storeId }

    const data = await CallCard.aggregate([
      { $match: query }
    ]);

    // const io = getSocket()
    // io.emit('store/getCallCard', {});

    res.status(200).json({
      status: 200,
      message: 'sucess',
      data: data
    })

  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 500, message: error.message || 'Server error' });
  }
}

exports.addCallCard = async (req, res) => {
  try {
    const { area, period, storeId, commercialRegistration, creditlimit, creditTerm,
      purchaser, payer, stockKeeper, stockKeeperPhone, note
    } = req.body
    const channel = req.headers['x-channel']
    const { CallCard } = getModelsByChannel(channel, res, callCardModel)
    const { Store } = getModelsByChannel(channel, res, storeModel)
    const { startDate, endDate } = rangeDate(period)
    const store = await Store.findOne({
      area: area,
      storeId: storeId,
      // createdAt: {
      //   $gte: startDate,
      //   $lt: endDate
      // }
    });

    if (!store) {
      return res.status(404).json({
        status: 404,
        message: 'Not found store',
      })
    }

    const existingCallCard = await CallCard.findOne({
      storeId: store.storeId,
      area: area,
      period: period
    });

    if (existingCallCard) {
      const updateFields = {};

      if (commercialRegistration !== '') updateFields.commercialRegistration = commercialRegistration;
      if (creditlimit !== '') updateFields.creditlimit = creditlimit;
      if (creditTerm !== '') updateFields.creditTerm = creditTerm;
      if (purchaser !== '') updateFields.purchaser = purchaser;
      if (payer !== '') updateFields.payer = payer;
      if (stockKeeper !== '') updateFields.stockKeeper = stockKeeper;
      if (stockKeeperPhone !== '') updateFields.stockKeeperPhone = stockKeeperPhone;
      if (note !== '') updateFields.note = note;

      if (existingCallCard) {
        const data = await CallCard.findOneAndUpdate(
          { area: area, period: period, storeId: storeId },
          { $set: updateFields },
          { new: true }
        );
      }
    }

    data = {
      storeId: store.storeId,
      storeName: store.name,
      area: store.area,
      period: period,
      commercialRegistration: commercialRegistration,
      creditlimit: creditlimit,
      creditTerm: creditTerm,
      purchaser: purchaser,
      payer: payer,
      stockKeeper: stockKeeper,
      stockKeeperPhone: stockKeeperPhone,
      note: note,
    }

    await CallCard.create(data)

    const io = getSocket()
    io.emit('store/addCallCard', {});


    res.status(200).json({
      status: 200,
      message: 'Sucessful',
      data: data
    })
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 500, message: error.message || 'Server error' });
  }
}

exports.delCallCard = async (req, res) => {
  try {
    const { area, period, storeId } = req.query;
    const channel = req.headers['x-channel'];
    const { CallCard } = getModelsByChannel(channel, res, callCardModel);

    const existingCallCard = await CallCard.findOne({
      storeId: storeId,
      area: area,
      period: period
    });

    if (existingCallCard) {
      await CallCard.deleteOne({
        storeId: storeId,
        area: area,
        period: period
      });

      const io = getSocket()
      io.emit('store/delCallCard', {});

      return res.status(200).json({
        status: 200,
        message: 'Delete successful'
      });
    } else {
      return res.status(404).json({
        status: 404,
        message: 'CallCard not found'
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 500, message: error.message || 'Server error' });
  }
}



exports.addFlowAction = async (req, res) => {
  try {
    const { area, period, storeId, flowAction } = req.body;
    const channel = req.headers['x-channel'];
    const { CallCard } = getModelsByChannel(channel, res, callCardModel);

    const existCallCard = await CallCard.findOne(
      { area: area, period: period, storeId: storeId }
    )

    if (!existCallCard) {
      return res.status(200).json({
        status: 200,
        message: 'Not found callcard'
      })
    }

    const data = await CallCard.findOneAndUpdate(
      { area: area, period: period, storeId: storeId },
      { $set: { flowAction: flowAction } },
      { new: true }
    );

    const io = getSocket()
    io.emit('store/addFlowAction', {});

    return res.status(200).json({
      status: 200,
      message: 'sucess',
      data: {
        storeId: storeId,
        area: area,
        period: period,
        flowAction: flowAction
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 500, message: error.message || 'Server error' });
  }
}

exports.getFlowAction = async (req, res) => {
  try {

    const { area, period, storeId, flowAction } = req.body;
    const channel = req.headers['x-channel'];
    const { CallCard } = getModelsByChannel(channel, res, callCardModel);




  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 500, message: error.message || 'Server error' });
  }

}

exports.delFlowAction = async (req, res) => {
  try {

    const { area, period, storeId, flowAction } = req.body;
    const channel = req.headers['x-channel'];
    const { CallCard } = getModelsByChannel(channel, res, callCardModel);

    const data = await CallCard.findOneAndUpdate(
      { area: area, period: period, storeId: storeId },
      { $set: { flowAction: flowAction } },
      { new: true }
    );


  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 500, message: error.message || 'Server error' });
  }

}


exports.updateDetailStore = async (req, res) => {
  try {
    const { area, period, storeId, ...rest } = req.body;
    const channel = req.headers['x-channel'];
    const { CallCard } = getModelsByChannel(channel, res, callCardModel);

    const existing = await CallCard.findOne({ area, period, storeId });
    if (!existing) {
      return res.status(404).json({
        status: 404,
        message: 'Not found callcard'
      });
    }

    // สร้าง object สำหรับ detailStore ที่ต้องอัปเดต
    const updatedFields = {};
    const allowedFields = [
      'floor',
      'marketStall',
      'warehouse',
      'owner',
      'rented',
      'takeover',
      'remainingContractTerm'
    ];

    for (const field of allowedFields) {
      if (rest[field] !== undefined && rest[field] !== '') {
        updatedFields[`detailStore.${field}`] = rest[field];
      }
    }

    const updated = await CallCard.findOneAndUpdate(
      { area, period, storeId },
      { $set: updatedFields },
      { new: true }
    );

    const io = getSocket()
    io.emit('store/updateDetailStore', {});


    return res.status(200).json({
      status: 200,
      message: 'Successful',
      data: updated
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: error.message || 'Server error'
    });
  }
};

exports.updateDailyvisit = async (req, res) => {
  try {
    const { area, period, storeId, ...rest } = req.body;
    const channel = req.headers['x-channel'];
    const { CallCard } = getModelsByChannel(channel, res, callCardModel);

    // หาเอกสารเดิม
    const existing = await CallCard.findOne({ area, period, storeId });
    if (!existing) {
      return res.status(404).json({
        status: 404,
        message: 'Not found callcard'
      });
    }

    // สร้าง object สำหรับ detailStore ที่ต้องอัปเดต
    const updatedFields = {};
    const allowedFields = [
      'monday',
      'tuseday',
      'wednesday',
      'thuresday',
      'friday',
    ];

    for (const field of allowedFields) {
      if (rest[field] !== undefined && rest[field] !== '') {
        updatedFields[`dayilyVisit.${field}`] = rest[field];
      }
    }

    const updated = await CallCard.findOneAndUpdate(
      { area, period, storeId },
      { $set: updatedFields },
      { new: true }
    );

    const io = getSocket()
    io.emit('store/updateDailyvisit', {});

    return res.status(200).json({
      status: 200,
      message: 'Successful',
      data: updated
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: error.message || 'Server error'
    });
  }
};


exports.updateGooglemap = async (req, res) => {
  try {
    const { area, period, storeId, googlemap } = req.body;
    const channel = req.headers['x-channel'];
    const { CallCard } = getModelsByChannel(channel, res, callCardModel);
    const data = await CallCard.findOneAndUpdate(
      { area: area, period: period, storeId: storeId },
      { $set: { googlemap: googlemap } },
      { new: true }
    );


    const io = getSocket()
    io.emit('store/updateGooglemap', {});

    return res.status(200).json({
      status: 200,
      message: 'Sucessful',
      data: {
        storeId: storeId,
        area: area,
        period: period,
        googlemap: googlemap
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 500, message: error.message || 'Server error' });
  }
}



exports.addVisit = async (req, res) => {
  const { area, period, storeId, googlemap } = req.body;
  const channel = req.headers['x-channel'];
  const { CallCard } = getModelsByChannel(channel, res, callCardModel);
  const { Order } = getModelsByChannel(channel, res, saleModel);
  const { Stock } = getModelsByChannel(channel, res, modelStock);
  const { Product } = getModelsByChannel(channel, res, modelProduct);
  const { SendMoney } = getModelsByChannel(channel, res, modelSendMoney);
  const modelOrder = await Order.aggregate([
    {
      $match: {
        'store.storeId': storeId,
        'store.area': area,
        period: period
      }
    },
    {
      $addFields: {
        createdAtFormatted: {
          $dateToString: {
            format: "%d/%m/%Y",
            date: "$createdAt"
          }
        }
      }
    },
  ]);

  const dataTran = await Promise.all(modelOrder.map(async i => {
    const dataStock = await Stock.findOne({ area, period });

    const group = {};

    for (const item of i.listProduct) {
      const productStock = dataStock?.listProduct.find(u => u.productId === item.id);
      const productDetail = await Product.findOne({ id: item.id });
      const factorObj = productDetail?.listUnit?.find(u => u.unit === item.unit);
      const factor = factorObj?.factor ?? 1;
      const qtyPcs = (item.qty ?? 0) * factor;

      const key = item.id;

      if (!group[key]) {
        group[key] = {
          productId: item.id,
          productName: item.name,
          stock: productStock?.balancePcs ?? 0,
          lot: '',
          order: 0,
        };
      }

      group[key].order += qtyPcs;

    }

    const listProduct = Object.values(group);

    const [day, month, year] = i.createdAtFormatted.split('/');
    const date = new Date(`${year}-${month}-${day}`);

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const sendmoney = await SendMoney.findOne({
      dateAt: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    });
    return {
      date: i.createdAtFormatted,
      listProduct,
      summaryOrder: listProduct.reduce((total, item) => total + (item.order ?? 0), 0),
      summaryCN: 0,
      summarySendmoney: sendmoney?.sendmoney || 0
    };
  }));

  function formatDateToThaiString(date) {
    // +7 ชั่วโมง
    const thDate = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    const day = String(thDate.getDate()).padStart(2, '0');
    const month = String(thDate.getMonth() + 1).padStart(2, '0');
    const year = thDate.getFullYear();
    return `${day}/${month}/${year}`;
  }


  const { startDate, endDate } = rangeDate(period)
  const tranObj = Object.fromEntries(dataTran.map(e => [e.date, e]));

  const data = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = formatDateToThaiString(new Date(d));

    // ถ้ามีข้อมูลใน dataTran ใช้ข้อมูลจริง, ถ้าไม่มี ใส่ค่า default
    if (tranObj[dateStr]) {
      data.push(tranObj[dateStr]);
    } else {
      data.push({
        date: dateStr,
        listProduct: [],
        summaryOrder: 0,
        summaryCN: 0,
        summarySendmoney: 0
      });
    }
  }
  const summaryOrder = data.reduce((total, item) => total + (item.summaryOrder ?? 0), 0)
  const summaryCN = data.reduce((total, item) => total + (item.summaryCN ?? 0), 0)
  const summarySendmoney = data.reduce((total, item) => total + (item.summarySendmoney ?? 0), 0)


  const CallCardData = await CallCard.findOneAndUpdate(
    { area: area, period: period, storeId: storeId },
    {
      $set: {
        visit: data,
        summaryOrder: summaryOrder,
        summaryCN: summaryCN,
        summarySendmoney: summarySendmoney
      }
    },
    { new: true }
  );

  const io = getSocket()
  io.emit('store/addVisit', {});



  res.status(200).json({
    status: 200,
    message: 'Sucess',
    // data: data,
    // summaryOrder: data.reduce((total, item) => total + (item.summaryOrder ?? 0), 0),
    // summaryCN: data.reduce((total, item) => total + (item.summaryCN ?? 0), 0),
    // summarySendmoney: data.reduce((total, item) => total + (item.summarySendmoney ?? 0), 0),
    CallCardData
  })

}