const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt');

const config = process.env
const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer')) {
        return res.status(401).json({
            status: 401,
            message: 'Authorization token is missing or invalid'
        });
    }
    const token = authHeader.split(' ')[1]
    jwt.verify(token, process.env.TOKEN_KEY, (err, decoded) => {
        if (err) {
            return res.status(403).json({
                status: 403,
                message: 'Invalid token'
            })
        }
        req.user = decoded
        next()
    })
};

module.exports = verifyToken