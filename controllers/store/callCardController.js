const callCardModel = require('../../models/cash/callcard')
const { getModelsByChannel } = require('../../middleware/channel')
exports.get = async (req, res) => {
  try {
    const { area, period, storeId } = req.query
    const channel = req.headers['x-channel'] // 'credit' or 'cash'

    const { CallCard } = getModelsByChannel(channel, res, callCardModel)
  } catch (error) {

  }
}

exports.add = async (req, res) => {
  try {
    const { area, period, storeId } = req.query
    const channel = req.headers['x-channel'] // 'credit' or 'cash'

    const { CallCard } = getModelsByChannel(channel, res, callCardModel)
  } catch (error) {
    
  }
}
