const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// ให้ Express ให้บริการไฟล์ static จากโฟลเดอร์ public
app.use(express.static('public'));

// ตั้งค่า WebSocket Connection
io.on('connection', (socket) => {
    console.log('a user connected');
    
    // ฟัง event จาก client
    socket.on('message', (msg) => {
        console.log('message from client: ' + msg);
    });

    // ส่งข้อมูลกลับไปยัง client
    socket.emit('message', 'Hello from server!');

    // เมื่อ disconnect
    socket.on('disconnect', () => {
        console.log('user disconnected');
    });
});

// ตั้งค่าให้ server รันที่ port 3000
server.listen(3000, () => {
    console.log('Server is running on port 3000');
});
