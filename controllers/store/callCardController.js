const callCardModel = require('../../models/cash/callcard')
const storeModel = require('../../models/cash/store')
const { getModelsByChannel } = require('../../middleware/channel')
const { rangeDate } = require('../../utilities/datetime')
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

    res.status(200).json({
      status: 200,
      message: 'test',
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
      purchaser, payer, stockKeeper, stockKeeperPhone
    } = req.body
    const channel = req.headers['x-channel']
    const { CallCard } = getModelsByChannel(channel, res, callCardModel)
    const { Store } = getModelsByChannel(channel, res, storeModel)
    const { startDate, endDate } = rangeDate(period)
    const store = await Store.findOne({
      area: area,
      storeId: storeId,
      createdAt: {
        $gte: startDate,
        $lt: endDate
      }
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
      return res.status(409).json({
        status: 409,
        message: 'CallCard for this store and period already exists.'
      });
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
      stockKeeperPhone: stockKeeperPhone
    }

    await CallCard.create(data)


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
    const data = await CallCard.findOneAndUpdate(
      { area: area, period: period, storeId: storeId },
      { $set: { flowAction: flowAction } },
      { new: true }
    );

    return res.status(200).json({
      status: 200,
      message: 'Sucessful',
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