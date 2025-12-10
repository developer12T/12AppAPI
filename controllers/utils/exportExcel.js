// utils/exportExcel.js
const xlsx = require('xlsx')
const os = require('os')
const path = require('path')
const fs = require('fs')
const ExcelJS = require('exceljs')

/**
 * Export JSON to Excel
 * @param {Object} res - Express response
 * @param {Array<Object>} rows - JSON to export
 * @param {String} sheetName - Sheet name in Excel
 * @param {String} fileName - Name for download
 */
const exportExcel = (res, rows, sheetName, fileName) => {
  try {
    // Create workbook + sheet
    const wb = xlsx.utils.book_new()
    const ws = xlsx.utils.json_to_sheet(rows)
    xlsx.utils.book_append_sheet(wb, ws, sheetName)

    // Save to OS temp folder
    const tempPath = path.join(os.tmpdir(), fileName)
    xlsx.writeFile(wb, tempPath)

    // Download & remove file after success
    return res.download(tempPath, fileName, err => {
      if (!err) fs.unlink(tempPath, () => {})
    })
  } catch (err) {
    console.error('Excel export error:', err)
    return res.status(500).json({ status: 500, message: 'Excel export failed' })
  }
}

const exportSendMoneyMonthly = async (res, finalRows, yearTH, monthNum) => {
  try {
    const workbook = new ExcelJS.Workbook()

    // ===== Helper โรยข้อมูลลงใน sheet =====
    const fillSheet = (ws, rows, title) => {
      const daysInMonth = new Date(yearTH - 543, monthNum, 0).getDate()

      const cols = []
      cols.push({ header: 'Zone / Salename', key: 'user', width: 15 })
      for (let d = 1; d <= daysInMonth; d++) {
        cols.push({ header: d.toString(), key: `d${d}`, width: 8 })
      }
      cols.push({ header: 'รวมทั้งสิ้น', key: 'total', width: 12 })
      ws.columns = cols

      // ------------------ HEADER ------------------
      ws.mergeCells(1, 1, 1, daysInMonth + 2)
      const titleCell = ws.getCell(1, 1)
      titleCell.value = title
      titleCell.font = { name: 'Angsana New', bold: true, size: 16 }
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' }

      ws.mergeCells(2, 1, 3, 1)
      ws.getCell(2, 1).value = 'Zone / Salename'
      ws.getCell(2, 1).font = { name: 'Angsana New', bold: true, size: 11 }
      ws.getCell(2, 1).alignment = { horizontal: 'center', vertical: 'middle' }

      ws.mergeCells(2, 2, 2, daysInMonth + 1)
      ws.getCell(2, 2).value = `ประจำเดือน ${monthNum.toLocaleString('th-TH', {
        month: 'long'
      })} ${yearTH}`
      ws.getCell(2, 2).font = { name: 'Angsana New', bold: true, size: 11 }
      ws.getCell(2, 2).alignment = { horizontal: 'center', vertical: 'middle' }

      ws.mergeCells(2, daysInMonth + 2, 3, daysInMonth + 2)
      ws.getCell(2, daysInMonth + 2).value = 'รวมทั้งสิ้น'
      ws.getCell(2, daysInMonth + 2).font = {
        name: 'Angsana New',
        bold: true,
        size: 11
      }

      ws.getCell(2, daysInMonth + 2).alignment = {
        horizontal: 'center',
        vertical: 'middle'
      }

      for (let d = 1; d <= daysInMonth; d++) {
        const cell = ws.getCell(3, d + 1)
        cell.value = d
        cell.font = { name: 'Angsana New', bold: true, size: 11 }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      }

      // ------------------ DATA GROUPING ------------------
      const grouped = {}
      rows.forEach(r => {
        if (r.areaAndName.toUpperCase().startsWith('IT')) return // ตัด IT
        const area = r.areaAndName
        const day = parseInt(r.date.split('-')[0], 10)
        if (!grouped[area]) grouped[area] = Array(daysInMonth).fill(0)
        grouped[area][day - 1] = Number(r.value) || 0 // << ใช้ field value
      })

      // ------------------ DATA ROWS (sort area) ------------------
      Object.keys(grouped)
        .sort((a, b) => a.localeCompare(b, 'th-TH'))
        .forEach(area => {
          const arr = grouped[area]
          const total = arr.reduce((a, b) => a + b, 0)
          const excelRow = ws.addRow([area, ...arr, total])

          excelRow.eachCell((cell, colNumber) => {
            if (colNumber === 1) {
              cell.font = { name: 'Angsana New', size: 11 }
              cell.alignment = { horizontal: 'left', vertical: 'middle' }
            } else {
              const val = Number(cell.value)
              if (val === 0) {
                cell.value = '-'
              }
              cell.font = { name: 'Angsana New', size: 11 }
              cell.numFmt = '#,##0.00'
              cell.alignment = { horizontal: 'center', vertical: 'middle' }
            }
          })
        })

      // ------------------ SUMMARY ROW ------------------
      const summary = ['รวม']
      for (let d = 0; d < daysInMonth; d++) {
        const sum = Object.values(grouped).reduce((s, arr) => s + arr[d], 0)
        summary.push(sum)
      }
      summary.push(summary.slice(1).reduce((a, b) => a + b, 0))

      const sumRow = ws.addRow(summary)
      sumRow.eachCell((c, n) => {
        if (n === 1) {
          c.font = { name: 'Angsana New', bold: true, size: 11 }
          c.alignment = { horizontal: 'left', vertical: 'middle' }
        } else {
          if (Number(c.value) === 0) c.value = '-'
          c.font = { name: 'Angsana New', bold: true, size: 11 }
          c.numFmt = '#,##0.00'
          c.alignment = { horizontal: 'center', vertical: 'middle' }
        }
      })

      // ------------------ AUTO WIDTH FOR DASH COLUMNS ------------------
      const dataStartRow = 4
      const dataEndRow = ws.rowCount - 1
      const dashOnlyColumns = []
      for (let col = 2; col <= daysInMonth + 2; col++) {
        let allDash = true
        for (let row = dataStartRow; row <= dataEndRow; row++) {
          const cell = ws.getCell(row, col)
          if (cell.value !== '-') {
            allDash = false
            break
          }
        }
        if (allDash) dashOnlyColumns.push(col)
      }
      dashOnlyColumns.forEach(col => {
        ws.getColumn(col).width = 3
      })

      // ------------------ BORDER ------------------
      ws.eachRow(row => {
        row.eachCell(cell => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          }
        })
      })

      // ------------------ Fix Title Alignment LAST ------------------
      titleCell.style = {
        alignment: { horizontal: 'center', vertical: 'middle' },
        font: { name: 'Angsana New', bold: true, size: 16 }
      }
    }

    // ===== SHEET 1: sendmoney =====
    const ws1 = workbook.addWorksheet('ยอดขาย')
    fillSheet(
      ws1,
      finalRows.map(r => ({
        ...r,
        value: r.totalSale
      })),
      `สรุปยอดเงินในระบบ ประจำเดือน ${monthNum.toLocaleString('th-TH', {
        month: 'long'
      })} ${yearTH}`
    )

    // ===== SHEET 2: sendmoneyAcc =====
    const ws2 = workbook.addWorksheet('ยอดโอน')
    fillSheet(
      ws2,
      finalRows.map(r => ({
        ...r,
        value: r.sendmoneyAcc
      })),
      `สรุปยอดส่งเงิน ประจำเดือน ${monthNum.toLocaleString('th-TH', {
        month: 'long'
      })} ${yearTH}`
    )

    // ===== EXPORT =====
    const fileName = `SendMoney_${yearTH}_${monthNum}.xlsx`
    const filePath = path.join(os.tmpdir(), fileName)
    await workbook.xlsx.writeFile(filePath)

    return res.download(filePath, fileName, err => {
      if (!err) fs.unlink(filePath, () => {})
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ status: 500, message: err.message })
  }
}

module.exports = { exportExcel, exportSendMoneyMonthly }
