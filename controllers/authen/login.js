const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const { getModelsByChannel } = require('../../middleware/channel')
const userModel = require('../../models/cash/user');
const typetruck = require('../../models/cash/typetruck');
const { encrypt, decrypt } = require('../../middleware/authen')


exports.login = async (req, res) => {
  try {
    const channel = 'user';
    const { User } = getModelsByChannel(channel, res, userModel);

    const data = await User.findOne({ username: req.body.username });

    if (!data) {
      return res.status(401).json({
        status: 401,
        message: 'Invalid username or password'
      });
    }

    let decryptedPassword;
    try {
      decryptedPassword = decrypt(data.password);
    } catch (err) {
      return res.status(500).json({
        status: 500,
        message: 'Password decryption failed'
      });
    }

    const passwordMatch = req.body.password === decryptedPassword;

    if (!passwordMatch) {
      return res.status(401).json({
        status: 401,
        message: 'Invalid username or password'
      });
    }

    const token = jwt.sign(
      { username: data.username },
      process.env.TOKEN_KEY,
      { expiresIn: '12h' }
    );

    await User.findOneAndUpdate(
      { username: req.body.username },
      { $set: { updatedAt: new Date() } },
      { new: true }
    );

    res.status(200).json({
      status: 200,
      message: 'Login successful',
      data: [{
        username: data.username,
        firstName: data.firstName,
        surName: data.surName,
        fullName: data.firstName + ' ' + data.surName,
        saleCode: data.saleCode,
        salePayer: data.salePayer,
        tel: data.tel,
        typeTruck: data.typeTruck,
        area: data.area,
        zone: data.zone,
        warehouse: data.warehouse,
        role: data.role,
        token: token
      }]
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: error.message
    });
  }
};