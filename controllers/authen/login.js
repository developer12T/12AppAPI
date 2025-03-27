
const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const { User } = require('../../models/cash/user')

exports.login = async (req, res) => {
    try {
        const data = await User.findOne({ username: req.body.username })
        if (!data) {
            res.status(507).json({
                status: 507,
                message: 'Validation failed'
            });
        } else {
            const passwordMatch = await bcrypt.compare(req.body.password, data.password)
            console.log(passwordMatch)
            if (passwordMatch) {
                const token = jwt.sign(
                    { username: data.username },
                    process.env.TOKEN_KEY,
                    { expiresIn: '12h' }
                )

                res.status(200).json({
                    status: 201,
                    message: 'log in complete',
                    data: [{
                        username: data.username,
                        firstName: data.firstName,
                        surName: data.surName,
                        fullName: data.firstName + ' ' + data.surName,
                        saleCode: data.saleCode,
                        salePayer: data.salePayer,
                        tel: data.tel,
                        area: data.area,
                        zone: data.zone,
                        warehouse: data.warehouse,
                        role: data.role,
                        token: token
                    }]
                });
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
