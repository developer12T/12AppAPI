// client.js
import { io } from 'socket.io-client'; // ใช้ ES Module (ต้องเปิด "type": "module" ใน package.json)

const socket = io('http://localhost:8005'); // เปลี่ยนตาม server จริง

socket.on('connect', () => {
  console.log('✅ Connected to server', socket.id);
});

socket.on('sale_response', data => {
  console.log('📦 ได้รับ response จาก server:', data);
});

socket.emit('request_sale', {
  saleCode: 'SALE-1234'
});
