const http = require('http')
require('dotenv').config()
const app = require('./app')
const { dbCA } = require('./config/db.js')
const { Server } = require('socket.io');

const { API_PORT } = process.env
const PORT = process.env.PORT || API_PORT

const server = http.createServer(app)
const { initSocket } = require("./socket.js");
const io = initSocket(server);

// ----------------------
// 🧹 Auto Clear Memory
// ----------------------
setInterval(() => {
    try {
        const usedMB = process.memoryUsage().rss / 1024 / 1024;

        console.log(`🧠 Memory Usage: ${usedMB.toFixed(2)} MB`);

        // ถ้า memory เกิน 1.2GB → สั่ง GC ทันที
        if (usedMB > 1200) {
            console.log('🔥 High memory detected. Running GC...');
            if (global.gc) {
                // global.gc();
                console.log('✅ GC executed successfully');
            } else {
                console.log('⚠️ GC not available. Start PM2 with --expose-gc');
            }
        }
    } catch (err) {
        console.error("❌ Memory Auto Clean Error:", err);
    }
}, 5 * 60 * 1000); // ทุก 5 นาที
// ----------------------

// ----------------------
// เช็ค Database แล้วเปิด Server
// ----------------------
const checkConnections = async () => {
    try {
        await Promise.all([
            dbCA.asPromise()
        ])
        console.log('All Databases Connected Successfully')

        server.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`)
        })
    } catch (error) {
        console.error('Failed to connect to databases:', error)
        process.exit(1)
    }
}

checkConnections()
module.exports = io
