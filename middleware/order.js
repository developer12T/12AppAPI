
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


module.exports.formatDateTimeToThai = function(date) {
  const thDate = new Date(new Date(date).getTime() + 7 * 60 * 60 * 1000);
  const day = String(thDate.getDate()).padStart(2, '0');
  const month = String(thDate.getMonth() + 1).padStart(2, '0');
  const year = thDate.getFullYear();
  const hour = String(thDate.getHours()).padStart(2, '0');
  const minute = String(thDate.getMinutes()).padStart(2, '0');
  const second = String(thDate.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
}


module.exports.to2 = function(num) {
  return Math.round((Number(num) || 0) * 100) / 100;
}


