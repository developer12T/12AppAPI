// summarizeKPI.js
const fs = require('fs')
const readline = require('readline')
const path = require('path')

const logPathFromArg = process.argv[2]

// default: ~/.pm2/logs/12AppAPI-out.log (เปลี่ยนชื่อไฟล์ตามโปรเจคได้)
const defaultLogPath = path.join(
  process.env.HOME || process.env.USERPROFILE || '',
  '.pm2',
  'logs',
  '12AppAPI-out.log'
)

const logFilePath = logPathFromArg || defaultLogPath

if (!fs.existsSync(logFilePath)) {
  console.error('ไม่พบไฟล์ log ที่:', logFilePath)
  console.error(
    'ลองระบุ path เอง เช่น: node summarizeKPI.js /path/to/logfile.log'
  )
  process.exit(1)
}

console.log('อ่าน log จาก:', logFilePath)

// ตัวเก็บข้อมูล
let totalRequests = 0
let totalErrors = 0
let totalResponseTime = 0
const responseTimes = []

const rl = readline.createInterface({
  input: fs.createReadStream(logFilePath),
  crlfDelay: Infinity
})

// รูปแบบบรรทัดจาก middleware:
// RT | METHOD URL | 123.45 ms | status 200
const rtRegex =
  /^RT\s*\|\s*(\w+)\s+(\S+)\s*\|\s*([\d.]+)\s*ms\s*\|\s*status\s*(\d+)/

rl.on('line', line => {
  const match = line.match(rtRegex)
  if (!match) return

  const method = match[1]
  const url = match[2]
  const rtMs = parseFloat(match[3])
  const statusCode = parseInt(match[4], 10)

  totalRequests += 1
  totalResponseTime += rtMs
  responseTimes.push(rtMs)

  if (statusCode >= 500) {
    totalErrors += 1
  }
})

rl.on('close', () => {
  if (totalRequests === 0) {
    console.log('ยังไม่มี Request ในไฟล์นี้')
    return
  }

  const avgResponseTime = totalResponseTime / totalRequests

  // คำนวณ P95
  responseTimes.sort((a, b) => a - b)
  const index95 = Math.floor(0.95 * (responseTimes.length - 1))
  const p95 = responseTimes[index95]

  const errorRate = (totalErrors / totalRequests) * 100

  console.log('================ KPI SUMMARY ================')
  console.log(`Total Requests     : ${totalRequests}`)
  console.log(`Total Errors (>=500): ${totalErrors}`)
  console.log(`Error Rate         : ${errorRate.toFixed(2)} %`)
  console.log('---------------------------------------------')
  console.log(`Average RT         : ${avgResponseTime.toFixed(2)} ms`)
  console.log(`P95 RT             : ${p95.toFixed(2)} ms`)
  console.log('==============================================')
})
