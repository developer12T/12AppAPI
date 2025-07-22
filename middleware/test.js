require('dotenv').config()
const { sendEmail } = require('../middleware/order') // ปรับ path ให้ถูก

sendEmail({
  to: 'aukrit.chi@onetwotrading.co.th',
  subject: 'แจ้งเตือนระบบ',
  html: '<h1>ทดสอบส่งเมล</h1><p>ระบบแจ้งเตือนทำงานแล้ว</p>',
})