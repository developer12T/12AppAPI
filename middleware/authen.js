const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt');

const config = process.env


const crypto = require('crypto');

const algorithm = 'aes-256-cbc';
const key = Buffer.from(process.env.AES_SECRET_KEY, 'hex'); // 32 bytes
const iv = Buffer.from(process.env.AES_IV, 'hex');           // 16 bytes

function encrypt(text) {
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function decrypt(encryptedText) {
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

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

module.exports = {
  verifyToken,
  encrypt,
  decrypt};