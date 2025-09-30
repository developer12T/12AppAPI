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

function getCurrentTimeFormatted () {
  const now = new Date()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${hours}${minutes}${seconds}`
}

function formatDate () {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0') // Months are zero-indexed
  const day = String(now.getDate()).padStart(2, '0')

  return `${year}${month}${day}`
}

const toThaiTime = (utcDate) => {
  if (!utcDate) return null;
  const date = new Date(utcDate);
  date.setHours(date.getHours() + 7);
  return date;
};

function formatDateToYYYYMMDD(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}


module.exports = {
  period,
  previousPeriod,
  timestamp,
  rangeDate,
  formatDate,
  getCurrentTimeFormatted,
  toThaiTime,
  formatDateToYYYYMMDD
}
