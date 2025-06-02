const { Server } = require('socket.io')

let io

function initSocket (server) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  })

  io.on('connection', socket => {
    console.log('A user connected:', socket.id)

    socket.on('request_sale_summary', data => {
      console.log('Sale request received:', data)
      io.emit('sale_getSummarybyArea', {
        message: 'Sale processed',
        saleCode: data.saleCode
      })
    })

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id)
    })
  })

  return io
}

function getSocket () {
  // console.log(io)
  if (!io) {
    throw new Error('Socket.io not initialized!')
  }
  return io
}

module.exports = { initSocket, getSocket }
