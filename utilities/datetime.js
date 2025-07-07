const moment = require('moment')

function period () {
  const date = moment().format('YYYYMM', 'th')
  return date
}

const previousPeriod = period => {
  const year = parseInt(period.slice(0, 4), 10)
  const month = parseInt(period.slice(4), 10)

  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year

  return `${prevYear}${prevMonth.toString().padStart(2, '0')}`
}

function timestamp () {
  const date = new Date()
  return `${date.getFullYear()}${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`
}

function rangeDate (period) {
  if (!period || period.length !== 6) {
    throw new Error('Invalid period format! Use YYYYMM')
  }

  const startDate = moment(period, 'YYYYMM').startOf('month').toDate()
  const endDate = moment(period, 'YYYYMM').endOf('month').toDate()

  return { startDate, endDate }
}

module.exports = { period, previousPeriod, timestamp, rangeDate }
