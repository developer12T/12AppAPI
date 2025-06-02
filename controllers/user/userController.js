// const { User } = require('../../models/cash/user')

const { uploadFiles } = require('../../utilities/upload')
const multer = require('multer')
const path = require('path')
const upload = multer({ storage: multer.memoryStorage() }).single('image')
const bcrypt = require('bcrypt')
const axios = require('axios')
const userModel = require('../../models/cash/user')
const { getModelsByChannel } = require('../../middleware/channel')
const { Types } = require('mongoose')

exports.getUser = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { User } = getModelsByChannel(channel, res, userModel)
    const users = await User.find({}).select(
      '-_id salecode salePayer username firstName surName tel zone area warehouse role'
    )

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
    const channel = req.headers['x-channel']
    const { User } = getModelsByChannel(channel, res, userModel)
    if (!userId && !username) {
      return res.status(400).json({
        status: 400,
        message: 'userId or username is required!'
      })
    }

    let query = userId ? { _id: userId } : { username }

    const user = await User.findOneAndUpdate(query, updateData, {
      new: true,
      select: '-_id -__v'
    }).lean()

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
    const channel = req.headers['x-channel']
    const { User } = getModelsByChannel(channel, res, userModel)
    upload(req, res, async err => {
      if (err) {
        return res.status(400).json({
          status: 400,
          message: 'Error uploading file',
          error: err.message
        })
      }

      const { userId, type } = req.body
      if (!userId || !type) {
        return res
          .status(400)
          .json({ status: 400, message: 'userId and type required!' })
      }

      const user = await User.findOne({ _id: userId })
      if (!user) {
        return res.status(404).json({ status: 404, message: 'User not found!' })
      }

      if (!req.file) {
        return res
          .status(400)
          .json({ status: 400, message: 'No images uploaded!' })
      }

      const basePath = path.join(__dirname, '../../public/images')
      const uploadedImage = await uploadFiles(
        [req.file],
        basePath,
        type,
        user.area
      )

      user.image = [
        {
          name: uploadedImage[0].name,
          path: uploadedImage[0].path,
          type: type
        }
      ]

      await user.save()

      res.status(200).json({
        status: 200,
        message: 'Images uploaded successfully!',
        data: user.image
      })
    })
  } catch (error) {
    console.error('Error uploading images:', error)
    res
      .status(500)
      .json({ status: 500, message: 'Server error', error: error.message })
  }
}

exports.getQRcode = async (req, res) => {
  try {
    const { area } = req.query
    const channel = req.headers['x-channel']
    const { User } = getModelsByChannel(channel, res, userModel)
    if (!area) {
      return res
        .status(400)
        .json({ status: 400, message: 'area are required!' })
    }

    const qrcode = await User.findOne({ area }).select('-_id qrCodeImage')

    // if (type) {
    //   qrcode.image = qrcode.image.filter(img => img.type === type)
    // }

    res.status(200).json({
      status: 200,
      message: 'successful!',
      data: qrcode.qrCodeImage
    })
  } catch (error) {
    console.error('Error uploading images:', error)
    res
      .status(500)
      .json({ status: 500, message: 'Server error', error: error.message })
  }
}

exports.addUser = async (req, res) => {
  try {
    let pathPhp = ''
    const channel = req.headers['x-channel']
    switch (channel) {
      case 'cash':
        pathPhp = 'ca_api/ca_user.php'
        break
      case 'credit':
        pathPhp = 'cr_api/cr_user.php'
        break
      default:
        break
    }
    const { User } = getModelsByChannel(channel, res, userModel)
    const response = await axios.post(
      `http://58.181.206.159:9814/apps_api/${pathPhp}`
    )

    for (const sale of response.data) {
      const saleInData = await User.findOne({ saleCode: sale.saleCode })
      if (!saleInData) {
        const newUser = new User({
          saleCode: sale.saleCode,
          salePayer: sale.salePayer,
          username: sale.username,
          firstName: sale.firstName,
          surName: sale.surName,
          password: sale.password,
          tel: sale.tel,
          zone: sale.zone,
          area: sale.area,
          warehouse: sale.warehouse,
          role: sale.role,
          status: sale.status,
          qrCodeImage: sale.qrCodeImage,
          image: ''
        })
        await newUser.save()
      }
    }

    res.status(200).json({
      status: 200,
      message: 'Insert User Success'
    })
  } catch (error) {
    console.error(e)
    res.status(500).json({
      status: 500,
      message: e.message
    })
  }
}

exports.addUserOne = async (req, res) => {
  const channel = req.headers['x-channel']
  const { User } = getModelsByChannel(channel, res, userModel)
  const saleInData = await User.findOne({ saleCode: req.body.saleCode })

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
      image: req.body.image
    })
    await user.save()
  } else {
    return res.status(409).json({
      status: 409,
      message: 'This saleCode already exists in the system'
    })
  }
  res.status(200).json({
    status: 200,
    message: 'Insert User Success'
  })
}

exports.updateUserOne = async (req, res) => {
  const channel = req.headers['x-channel']
  const { User } = getModelsByChannel(channel, res, userModel)
  const user = await User.updateOne(
    { saleCode: req.body.saleCode },
    {
      $set: {
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
        image: req.body.image
      }
    }
  )

  if (user.modifiedCount == 0) {
    return res.status(409).json({
      status: 409,
      message: 'Not Found this saleCode'
    })
  }

  res.status(200).json({
    status: 200,
    message: 'Update User Success'
  })
}

exports.addAndUpdateUser = async (req, res) => {
  const channel = req.headers['x-channel']
  const { User } = getModelsByChannel(channel, res, userModel)
  const userMongo = await User.find()
  let pathPhp = ''
  switch (channel) {
    case 'cash':
      pathPhp = 'ca_api/ca_user.php'
      break
    case 'credit':
      pathPhp = 'cr_api/cr_user.php'
      break
    default:
      break
  }

  const userM3 = await axios.post(
    `http://58.181.206.159:9814/apps_api/${pathPhp}`
  )
  let update = 0
  let addNew = 0
  for (const m3 of userM3.data) {
    const userInMongo = userMongo.find(id => id.saleCode == m3.saleCode)

    if (userInMongo) {
      const hasChanged = Object.keys(m3).some(
        key =>
          !['saleCode', '__v'].includes(key) && m3[key] !== userInMongo[key]
      )

      if (hasChanged) {
        console.log(m3)
        await User.updateOne(
          { saleCode: m3.saleCode },
          {
            $set: {
              salePayer: m3.salePayer,
              username: m3.username,
              firstName: m3.firstName,
              surName: m3.surName,
              password: m3.password,
              tel: m3.tel,
              zone: m3.zone,
              area: m3.area,
              warehouse: m3.warehouse,
              role: m3.role,
              status: m3.status
              // __v: m3.__v + 1
            }
          }
        )
        update += 1
      }
    } else {
      await User.create({
        saleCode: m3.saleCode,
        salePayer: m3.salePayer,
        username: m3.username,
        firstName: m3.firstName,
        surName: m3.surName,
        password: m3.password,
        tel: m3.tel,
        zone: m3.zone,
        area: m3.area,
        warehouse: m3.warehouse,
        role: m3.role,
        status: m3.status
        // __v: 0
      })
      addNew += 1
    }
  }
  res.status(200).json({
    status: 200,
    message: `Insert And Update Success`,
    Update: update,
    Add: addNew
  })
}
