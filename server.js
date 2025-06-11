const http = require('http')
require('dotenv').config()
const app = require('./app')
const { dbCA } = require('./config/db.js')
// const { Server } = require('socket.io');
// const { initSocket } = require("./socket.js");

const { API_PORT } = process.env
const PORT = process.env.PORT || API_PORT

const server = http.createServer(app)

// const io = initSocket(server);


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
// module.exports = io