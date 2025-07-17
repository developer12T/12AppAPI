const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const { getModelsByChannel } = require('../../middleware/channel')
const userModel = require('../../models/cash/user');
const typetruck = require('../../models/cash/typetruck');

exports.login = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { User } = getModelsByChannel(channel, res, userModel)
    const data = await User.findOne({ username: req.body.username })
    if (!data) {
      res.status(507).json({
        status: 507,
        message: 'Validation failed'
      })
    } else {
      const passwordMatch = await bcrypt.compare(
        req.body.password,
        data.password
      )
      // console.log(data.password)
      if (passwordMatch) {
        const token = jwt.sign(
          { username: data.username },
          process.env.TOKEN_KEY,
          { expiresIn: '12h' }
        )

        const currentDate = new Date()
        // console.log(currentDate)
        await User.findOneAndUpdate(
          { username: req.body.username },  
          { $set: { updatedAt: currentDate } }, 
          { new: true }  
        );



        res.status(200).json({
          status: 201,
          message: 'log in complete',
          data: [
            {
              username: data.username,
              firstName: data.firstName,
              surName: data.surName,
              fullName: data.firstName + ' ' + data.surName,
              saleCode: data.saleCode,
              salePayer: data.salePayer,
              tel: data.tel,
              typeTruck:data.typeTruck,
              area: data.area,
              zone: data.zone,
              warehouse: data.warehouse,
              role: data.role,
              token: token
            }
          ]
        })
      } else {
        res.status(507).json({
          status: 507,
          message: 'Validation failed'
        })
      }
    }
  } catch (error) {
    console.log(error)
    res.status(500).json({
      status: 500,
      message: error.message
    })
  }
}
