const { User } = require('../../models/cash/user')
const { uploadFiles } = require('../../utilities/upload')
const multer = require('multer')
const path = require('path')
const upload = multer({ storage: multer.memoryStorage() }).single('image')
const bcrypt = require('bcrypt')
const axios = require('axios')
const userModel = require('../../models/cash/user');
const { getModelsByChannel } = require('../../middleware/channel')
const { Types } = require('mongoose');

exports.getUser = async (req, res) => {
    try {
        const channel = req.headers['x-channel']; 
        const { User } = getModelsByChannel(channel,res,userModel); 
        const users = await User.find({}).select('-_id salecode salePayer username firstName surName tel zone area warehouse role')

        if (!users || users.length === 0) {
            res.status(404).json({ status: 404, message: 'User is empty!' })
        }
        res.status(200).json({
            status: 200,
            message: 'successful!',
            data: users
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ status: '500', message: error.message })
    }
}

exports.editUser = async (req, res) => {
    try {
        const { userId, username, ...updateData } = req.body
        const channel = req.headers['x-channel']; 
        const { User } = getModelsByChannel(channel,res,userModel); 
        if (!userId && !username) {
            return res.status(400).json({
                status: 400,
                message: 'userId or username is required!'
            })
        }

        let query = userId ? { _id: userId } : { username }

        const user = await User.findOneAndUpdate(query, updateData, { new: true, select: '-_id -__v' }).lean()

        if (!user) {
            return res.status(404).json({
                status: 404,
                message: 'User not found!'
            })
        }

        res.status(200).json({
            status: 200,
            message: 'User updated successfully!',
            data: user
        })

    } catch (error) {
        console.error('Error updating user:', error)
        res.status(500).json({ status: 500, message: error.message })
    }
}

exports.addImage = async (req, res) => {
    try {
        const channel = req.headers['x-channel']; 
        const { User } = getModelsByChannel(channel,res,userModel); 
        upload(req, res, async (err) => {
            if (err) {
                return res.status(400).json({ status: 400, message: 'Error uploading file', error: err.message })
            }

            const { userId, type } = req.body
            if (!userId || !type) {
                return res.status(400).json({ status: 400, message: 'userId and type required!' })
            }

            const user = await User.findOne({ _id: userId })
            if (!user) {
                return res.status(404).json({ status: 404, message: 'User not found!' })
            }

            if (!req.file) {
                return res.status(400).json({ status: 400, message: 'No images uploaded!' })
            }

            const basePath = path.join(__dirname, '../../public/images')
            const uploadedImage = await uploadFiles([req.file], basePath, type, user.area)

            user.image = [{
                name: uploadedImage[0].name,
                path: uploadedImage[0].path,
                type: type
            }]

            await user.save()

            res.status(200).json({
                status: 200,
                message: 'Images uploaded successfully!',
                data: user.image
            })
        })
    } catch (error) {
        console.error('Error uploading images:', error)
        res.status(500).json({ status: 500, message: 'Server error', error: error.message })
    }
}

exports.getQRcode = async (req, res) => {
    try {
        const { area, type } = req.query
        const channel = req.headers['x-channel']; 
        const { User } = getModelsByChannel(channel,res,userModel); 
        if (!area || !type) {
            return res.status(400).json({ status: 400, message: 'area and type are required!' })
        }

        const qrcode = await User.findOne({ area }).select('-_id image')

        if (type) {
            qrcode.image = qrcode.image.filter(img => img.type === type)
        }

        res.status(200).json({
            status: 200,
            message: 'successful!',
            data: qrcode
        })

    } catch (error) {
        console.error('Error uploading images:', error)
        res.status(500).json({ status: 500, message: 'Server error', error: error.message })
    }
}


exports.addUser = async (req , res) => {
    const channel = req.headers['x-channel']; 
    const { User } = getModelsByChannel(channel,res,userModel); 
    const response = await axios.post(
      'http://58.181.206.159:9814/ca_api/cr_user.php'
    )

    for (const sale of response.data) {
        const saleInData = await User.findOne({ saleCode: sale.saleCode });
        if (!saleInData) {

            const newUser = new User({
                saleCode:sale.saleCode,
                salePayer:sale.salePayer,
                username:sale.username,
                firstName:sale.firstName,
                surName:sale.surName,
                password:sale.password,
                tel:sale.tel,
                zone:sale.zone,
                area:sale.area,
                warehouse:sale.warehouse,
                role:sale.role,
                status:sale.status,
                image:""
            });
          await newUser.save();
        }
      }


    res.status(200).json({
        status:200,
        message:'Insert User Success'
    })
}

exports.addUserOne = async (req , res) => {
    const channel = req.headers['x-channel']; 
    const { User } = getModelsByChannel(channel,res,userModel); 
    const saleInData = await User.findOne({ saleCode: req.body.saleCode });

    if (!saleInData) {
        const user = new User({
            saleCode: req.body.saleCode,
            salePayer: req.body.salePayer,
            username: req.body.username,
            firstName: req.body.firstName,
            surName: req.body.surName,
            password: req.body.password,
            tel: req.body.tel,
            zone: req.body.zone,
            area: req.body.area,
            warehouse: req.body.warehouse,
            role: req.body.role,
            status: req.body.status,
            image:req.body.image
          });
          await user.save();
    }
    else {
        return res.status(409).json({
            status:409,
            message: "This saleCode already exists in the system"
        })
        
    }
    res.status(200).json({
        status:200,
        message:'Insert User Success'
    })
}


exports.updateUserOne = async (req , res) => {
    const channel = req.headers['x-channel']; 
    const { User } = getModelsByChannel(channel,res,userModel); 
    const user = await User.updateOne(
        { saleCode: req.body.saleCode },  
        { $set: {
            salePayer: req.body.salePayer,
            username: req.body.username,
            firstName: req.body.firstName,
            surName: req.body.surName,
            password: req.body.password,
            tel: req.body.tel,
            zone: req.body.zone,
            area: req.body.area,
            warehouse: req.body.warehouse,
            role: req.body.role,
            status: req.body.status,
            image:req.body.image

        }}
      );

      if (user.modifiedCount == 0) {
        return res.status(409).json({
            status:409,
            message:"Not Found this saleCode"
        })
      } 



      res.status(200).json({
        status:200,
        message:'Update User Success'
      })

}