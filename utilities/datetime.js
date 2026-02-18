const moment = require('moment')

function period() {
  const date = moment().format('YYYYMM', 'th')
  return date
}

function periodNew() {
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

function timestamp() {
  const date = new Date()
  return `${date.getFullYear()}${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`
}

function rangeDate(period) {
  if (!period || period.length !== 6) {
    throw new Error('Invalid period format! Use YYYYMM')
  }

  const startDate = moment(period, 'YYYYMM').startOf('month').toDate()
  const endDate = moment(period, 'YYYYMM').endOf('month').toDate()

  return { startDate, endDate }
}

function getCurrentTimeFormatted() {
  const now = new Date()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${hours}${minutes}${seconds}`
}

function formatDate() {
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

function generateDates(startDate, days) {
  // console.log('startDate',startDate)
  if (!startDate || typeof startDate !== 'string') {
    throw new Error(`Invalid startDate: ${startDate}`)
  }

  const start = new Date(`${startDate}T00:00:00Z`)

  if (isNaN(start.getTime())) {
    throw new Error(`Invalid date format: ${startDate}`)
  }

  const result = []

  for (let i = 0; i <= days; i++) {

    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    result.push({
      date: d.toISOString().slice(0, 10),
      day: String(i + 1).padStart(2, '0')
    })
  }

  return result
}

function formatThaiSQL(dateInput) {

  // ถ้าไม่มีค่า
  if (!dateInput) {
    return '1970-01-01 07:00:00'
  }

  const d = new Date(
    new Date(dateInput).toLocaleString('en-US', {
      timeZone: 'Asia/Bangkok'
    })
  )

  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')

  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

function toThaiDateOrDefault(dateInput) {
  let d

  if (!dateInput) {
    d = new Date(0)
  } else {
    d = new Date(dateInput)
    if (isNaN(d)) return null
  }

  const utc = d.getTime() + (d.getTimezoneOffset() * 60000)
  const thai = new Date(utc + (7 * 60 * 60000))

  const pad = n => String(n).padStart(2, '0')

  return `${thai.getFullYear()}-${pad(thai.getMonth() + 1)}-${pad(thai.getDate())} `
    + `${pad(thai.getHours())}:${pad(thai.getMinutes())}:${pad(thai.getSeconds())}`
}



module.exports = {
  period,
  previousPeriod,
  timestamp,
  rangeDate,
  formatDate,
  getCurrentTimeFormatted,
  toThaiTime,
  formatDateToYYYYMMDD,
  periodNew,
  generateDates,
  formatThaiSQL,
  toThaiDateOrDefault
}
