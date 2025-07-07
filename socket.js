const { Server } = require('socket.io');
let io;

function initSocket(server) {
  io = new Server(server, {
    cors: { origin: "*" }
  });

  io.on("connection", (socket) => {
    console.log("🟢 Client connected:", socket.id);

    socket.on("request_sale", (payload) => {
      console.log("📨 รับคำขอจาก client:", payload);
      socket.emit("sale_response", {
        message: "ข้อมูลของ sale",
        saleCode: payload.saleCode
      });
    });

    socket.on("disconnect", () => {
      console.log("🔴 Client disconnected:", socket.id);
    });
  });

  return io;
}

function getSocket() {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
}

module.exports = { initSocket, getSocket };
