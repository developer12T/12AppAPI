
const { OOTYPE, NumberSeries } = require('../models/cash/master')



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


module.exports.to2 = function(num) {
  return Math.round((Number(num) || 0) * 100) / 100;
}