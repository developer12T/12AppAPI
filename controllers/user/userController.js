const { User } = require('../../models/cash/user')
const { uploadFiles } = require('../../utilities/upload')
const multer = require('multer')
const path = require('path')
const upload = multer({ storage: multer.memoryStorage() }).single('image')

exports.getUser = async (req, res) => {
    try {
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