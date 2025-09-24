const mongoose = require('mongoose')
const { Customer } = require('../../models/cash/master')
const { uploadFiles } = require('../../utilities/upload')
const { sequelize, DataTypes } = require('../../config/m3db')
const { calculateSimilarity } = require('../../utilities/utility')
const axios = require('axios')
const multer = require('multer')
const userModel = require('../../models/cash/user')
const storeLatLongModel = require('../../models/cash/storeLatLong')
const ExcelJS = require('exceljs')
const { generateOrderIdStoreLatLong } = require('../../utilities/genetateId')
const { getSocket } = require('../../socket')
const addUpload = multer({ storage: multer.memoryStorage() }).array(
  'storeImages'
)
const { toThaiTime } = require('../../utilities/datetime')
const sharp = require('sharp')
const xlsx = require('xlsx')

const sql = require('mssql')
const {
  storeQuery,
  storeQueryFilter,
  groupStoreType
} = require('../../controllers/queryFromM3/querySctipt')

// ===== helper: สร้างไดเรกทอรี + เซฟไฟล์ buffer เป็น .webp =====
// async function saveImageBufferToWebp({ buffer, destDir, baseName }) {
//   await fsp.mkdir(destDir, { recursive: true })
//   const fileName = `${baseName}.webp`
//   const fullDiskPath = path.join(destDir, fileName)
//   await sharp(buffer).webp({ quality: 80 }).toFile(fullDiskPath)
//   return { fileName, fullDiskPath }
// }

// const getUploadMiddleware = channel => {
//   const storage = multer.memoryStorage()
//   const maxFiles = channel === 'cash' ? 3 : 6
//   return multer({
//     storage,
//     limits: {
//       files: maxFiles,
//       fileSize: 20 * 1024 * 1024 // 20MB/ไฟล์
//     },
//     fileFilter: (req, file, cb) => {
//       if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype)) {
//         return cb(new Error('Only image files are allowed'))
//       }
//       cb(null, true)
//     }
//   }).array('storeImages')
//   // console.log(fileFilter)
// }

const getUploadMiddleware = channel => {
  console.log('[getUploadMiddleware] channel =', channel) // เรียกใช้แน่นอน

  const storage = multer.memoryStorage()
  const maxFiles = channel === 'cash' ? 3 : 6

  const m = multer({
    storage,
    limits: { files: maxFiles, fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      console.log(
        '[fileFilter] field=%s name=%s mime=%s',
        file.fieldname,
        file.originalname,
        file.mimetype
      )

      // if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype)) {
      //   console.warn('[fileFilter] reject:', file.originalname, file.mimetype)
      //   return cb(new Error('Only image files are allowed'))
      // }
      cb(null, true)
    }
  }).array('storeImages')

  // หุ้มอีกชั้นเพื่อ log ก่อน/หลังอัปโหลด
  return (req, res, next) => {
    console.log('[upload:start] content-type =', req.headers['content-type'])
    m(req, res, err => {
      if (err) {
        console.error('[upload:error]', err.message)
        return next(err)
      }
      const files = (req.files || []).map(f => ({
        field: f.fieldname,
        name: f.originalname,
        mime: f.mimetype,
        size: f.size
      }))
      console.log('[upload:done] files =', files)
      console.log('[upload:done] fields =', req.body)
      next()
    })
  }
}

// const getUploadMiddleware = channel => {
//   const storage = multer.memoryStorage()
//   let limits = {}

//   if (channel == 'cash') {
//     limits = {
//       files: 3
//     }
//   } else if (channel == 'credit') {
//     limits = {
//       files: 6
//     }
//   }

//   return multer({ storage, limits }).array('storeImages')
// }

const orderModel = require('../../models/cash/sale')
const storeModel = require('../../models/cash/store')
const routeModel = require('../../models/cash/route')
const refundModel = require('../../models/cash/refund')
const approveLogModel = require('../../models/cash/approveLog')
// const userModel = require('../../models/cash/user')
const DistributionModel = require('../../models/cash/distribution')
const promotionModel = require('../../models/cash/promotion')
const { getModelsByChannel } = require('../../middleware/channel')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { v4: uuidv4 } = require('uuid')

uuidv4() // ⇨ '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'
const {
  productQuery,
  bueatyStoreQuery
} = require('../../controllers/queryFromM3/querySctipt')
const store = require('../../models/cash/store')
const { trace } = require('console')

exports.getDetailStore = async (req, res) => {
  try {
    const { storeId } = req.params
    const channel = req.headers['x-channel'] // 'credit' or 'cash'

    const { Store } = getModelsByChannel(channel, res, storeModel)

    // ตัวอย่างดึงข้อมูลจาก MongoDB
    const storeData = await Store.findOne({ storeId }).lean()

    if (!storeData) {
      return res.status(404).json({ status: 404, message: 'Store not found' })
    }

    // const io = getSocket()
    // io.emit('store/', {});

    // ส่งข้อมูลกลับ
    res.status(200).json({
      status: 200,
      data: storeData
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getStore = async (req, res) => {
  try {
    const { area, type, route, zone, team, year, month, showMap } = req.query
    const channel = req.headers['x-channel'] // 'credit' or 'cash'

    const { Store } = getModelsByChannel(channel, res, storeModel)

    const currentDate = new Date()
    // startMonth: 3 เดือนที่แล้ว (นับรวมเดือนนี้)
    const startMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() - 2,
      1
    )
    const nextMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      1
    )

    let query = {}
    query.route = { $nin: ['DEL'] }

    // Priority: ใช้ month/year filter ก่อน type
    if (month && year) {
      // หมายเหตุ: month ใน JS index เริ่มที่ 0 (มกราคม=0), แต่ใน req.query month=7 (กรกฎาคม)
      // query.status = '20'
      const m = parseInt(month) - 1 // ปรับ index ให้เป็น 0-based
      const y = parseInt(year)
      const startDate = new Date(y, m, 1)
      // หา "วันสุดท้ายของเดือน"
      const endDate = new Date(y, m + 1, 0, 23, 59, 59, 999)
      query.createdAt = {
        $gte: startDate,
        $lte: endDate
      }
    } else if (type === 'new') {
      // 3 เดือนล่าสุด
      // query.status = { $in: ['20', '10'] }
      query.createdAt = {
        $gte: startMonth,
        $lt: nextMonth
      }
    } else {
      query.status = { $nin: ['10', '90'] }
    } // ถ้า type=all ไม่ต้อง filter createdAt เลย

    if (area) {
      query.area = area
    } else if (zone) {
      query.area = { $regex: `^${zone}`, $options: 'i' }
    }

    if (route) {
      query.route = route
    }

    const pipeline = [
      { $match: query },
      {
        $lookup: {
          from: 'typestores',
          localField: 'storeId',
          foreignField: 'storeId',
          as: 'beauty'
        }
      },
      {
        $addFields: {
          storetype: {
            $reduce: {
              input: '$beauty',
              initialValue: [],
              in: {
                $concatArrays: ['$$value', '$$this.type']
              }
            }
          },
          team3: {
            $concat: [
              { $substrCP: ['$area', 0, 2] },
              { $substrCP: ['$area', 3, 1] }
            ]
          }
        }
      }
    ]

    if (team) {
      pipeline.push({
        $match: {
          team3: { $regex: `^${team}`, $options: 'i' }
        }
      })
    }

    pipeline.push(
      {
        $project: {
          _id: 0,
          __v: 0,
          beauty: 0
        }
      },
      {
        $sort: {
          status: 1,
          createdAt: -1
        }
      }
    )

    let data = await Store.aggregate(pipeline)

    if (showMap === 'true') {
      data = data.map(item => ({
        storeId: item.storeId,
        name: item.name,
        zone: item.zone,
        address: item.address,
        latitude: item.latitude ? parseFloat(item.latitude) : null,
        longitude: item.longtitude ? parseFloat(item.longtitude) : null
      }))
    }

    if (data.length === 0) {
      return res.status(404).json({
        status: 404,
        message: 'Not Found Store'
      })
    }

    // const io = getSocket()
    // io.emit('store/getStore', {});

    res.status(200).json({
      status: '200',
      message: 'Success',
      data: data
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.updateImage = async (req, res) => {
  const channel = req.headers['x-channel'] // 'credit' or 'cash'

  const { Store } = getModelsByChannel(channel, res, storeModel)

  addUpload(req, res, async err => {
    if (err) {
      return res.status(400).json({ status: '400', message: err.message })
    }
    try {
      if (!req.body.storeId) {
        return res.status(400).json({
          status: '400',
          message: 'Store ID is required'
        })
      }
      const files = req.files
      const storeId = req.body.storeId
      const types = req.body.types ? req.body.types.split(',') : []

      if (files.length !== types.length) {
        return res.status(400).json({
          status: '400',
          message: 'Number of files and types do not match'
        })
      }
      const store = await Store.findOne({ storeId: storeId })

      if (!store) {
        return res
          .status(404)
          .json({ status: '404', message: 'Store not found' })
      }

      const existingImageList = store.imageList || []
      const existingTypes = new Set(existingImageList.map(item => item.type))

      const uploadedFiles = []
      for (let i = 0; i < files.length; i++) {
        const type = types[i]

        // ถ้ามี type นี้อยู่แล้วใน DB, ไม่ต้องอัปโหลด
        if (existingTypes.has(type)) {
          continue
        }

        const uploadedFile = await uploadFiles(
          [files[i]],
          path.join(__dirname, '../../public/images/stores'),
          store.area,
          type
        )

        uploadedFiles.push({
          name: uploadedFile[0].name,
          path: uploadedFile[0].fullPath,
          type: type
        })
      }

      const imageList = uploadedFiles

      if (uploadedFiles.length > 0) {
        await Store.updateOne(
          { storeId: storeId },
          { $push: { imageList: { $each: uploadedFiles } } }
        )
      }

      res.status(200).json({
        status: '200',
        message: 'Store update successfully'
        // data:storeData
      })
    } catch (error) {
      console.error('Error saving store to MongoDB:', error)
      res.status(500).json({ status: '500', message: 'Server Error' })
    }
  })
}

// ===== helper: สร้างไดเรกทอรี + เซฟไฟล์ buffer เป็น .webp =====
// async function saveImageBufferToWebp({ buffer, destDir, baseName }) {
//   await fsp.mkdir(destDir, { recursive: true })
//   const fileName = `${baseName}.webp`
//   const fullDiskPath = path.join(destDir, fileName)
//   await sharp(buffer).webp({ quality: 80 }).toFile(fullDiskPath)
//   return { fileName, fullDiskPath }
// }

exports.addStore = async (req, res) => {
  const channel = req.headers['x-channel'] // 'credit' or 'cash'
  const { Store } = getModelsByChannel(channel, res, storeModel)
  const upload = getUploadMiddleware(channel)
  console.log(upload)

  upload(req, res, async err => {
    // if (err) {
    //   return res.status(400).json({ status: '400', message: err.message })
    // }
    console.log(req.body)

    try {
      // if (!req.body.store) {
      //   return res
      //     .status(400)
      //     .json({ status: '400', message: 'Store data is required' })
      // }

      const files = req.files || []
      const store = JSON.parse(req.body.store)
      const types = req.body.types ? req.body.types.split(',') : []

      // if (!store.name || !store.address) {
      //   return res.status(400).json({
      //     status: '400',
      //     message: 'Required fields are missing: name, address'
      //   })
      // }

      // if (files.length !== types.length) {
      //   return res.status(400).json({
      //     status: '400',
      //     message: 'Number of files and types do not match'
      //   })
      // }

      const uploadedFiles = []
      for (let i = 0; i < files.length; i++) {
        const uploadedFile = await uploadFiles(
          [files[i]],
          path.join(__dirname, '../../public/images/stores'),
          store.area,
          types[i]
        )

        const originalPath = uploadedFile[0].fullPath // เช่น .../public/images/stores/xxx.jpg
        const webpPath = originalPath.replace(/\.[a-zA-Z]+$/, '.webp') // แปลงชื่อไฟล์นามสกุล .webp

        await sharp(originalPath)
          .rotate()
          .resize(800)
          .webp({ quality: 80 })
          .toFile(webpPath)

        fs.unlinkSync(originalPath)
        uploadedFiles.push({
          name: path.basename(webpPath),
          path: webpPath,
          type: types[i]
        })
      }

      const imageList = uploadedFiles

      const policyAgree = { status: store.policyConsent?.status || '' }
      const approve = { status: '19' }

      const shippingAddress = Array.isArray(store.shippingAddress)
        ? store.shippingAddress
        : []
      const shipping = shippingAddress.map(ship => ({
        default: ship.default || '',
        address: ship.address || '',
        district: ship.district || '',
        subDistrict: ship.subDistrict || '',
        provinceCode: ship.provinceCode || '',
        province: ship.province || '',
        postCode: ship.postCode || '',
        latitude: ship.latitude || '',
        longtitude: ship.longtitude || ''
      }))

      const storeData = new Store({
        storeId: uuidv4(),
        name: store.name,
        taxId: store.taxId,
        tel: store.tel,
        route: store.route,
        type: store.type,
        typeName: store.typeName,
        address: store.address,
        district: store.district,
        subDistrict: store.subDistrict,
        province: store.province,
        provinceCode: store.provinceCode,
        postCode: store.postCode,
        zone: store.zone,
        area: store.area,
        latitude: store.latitude,
        longtitude: store.longtitude,
        lineId: store.lineId,
        note: store.note,
        status: '10',
        approve,
        policyConsent: policyAgree,
        imageList,
        shippingAddress: shipping,
        checkIn: {}
      })

      await storeData.save()

      const io = getSocket()
      io.emit('store/addStore', {
        status: '200',
        message: 'Store added successfully'
      })

      return res.status(200).json({
        status: '200',
        message: 'Store added successfully',
        data: {
          storeId: storeData.storeId,
          imageList // คืนให้ client ใช้แสดงรูปต่อได้ทันที
        }
      })
    } catch (error) {
      console.error('Error saving store to MongoDB:', error)
      return res
        .status(500)
        .json({ status: '500', message: 'Server Error', debug: error.message })
    }
  })
}

// exports.addStore = async (req, res) => {
//   const channel = req.headers['x-channel'] // 'credit' or 'cash'
//   const { Store } = getModelsByChannel(channel, res, storeModel)
//   const upload = getUploadMiddleware(channel)

//   upload(req, res, async err => {
//     if (err) {
//       return res.status(400).json({ status: '400', message: err.message })
//     }
//     try {
//       if (!req.body.store) {
//         return res.status(400).json({
//           status: '400',
//           message: 'Store data is required'
//         })
//       }

//       const files = req.files
//       const store = JSON.parse(req.body.store)
//       const types = req.body.types ? req.body.types.split(',') : []

//       if (!store.name || !store.address) {
//         return res.status(400).json({
//           status: '400',
//           message: 'Required fields are missing: name, address'
//         })
//       }

//       if (files.length !== types.length) {
//         return res.status(400).json({
//           status: '400',
//           message: 'Number of files and types do not match'
//         })
//       }

//       const uploadedFiles = []
//       for (let i = 0; i < files.length; i++) {
//         const uploadedFile = await uploadFiles(
//           [files[i]],
//           path.join(__dirname, '../../public/images/stores'),
//           store.area,
//           types[i]
//         )
//         console.log(__dirname, '../../public/images/stores')

//         const originalPath = uploadedFile[0].fullPath // เช่น .../public/images/stores/xxx.jpg
//         const webpPath = originalPath.replace(/\.[a-zA-Z]+$/, '.webp') // แปลงชื่อไฟล์นามสกุล .webp

//         fs.unlinkSync(originalPath)
//         uploadedFiles.push({
//           name: path.basename(webpPath),
//           path: webpPath,
//           type: types[i]
//         })
//       }

//       const imageList = uploadedFiles

//       const policyAgree = {
//         status: store.policyConsent?.status || ''
//       }
//       const approve = {
//         status: '19'
//       }

//       const shippingAddress = Array.isArray(store.shippingAddress)
//         ? store.shippingAddress
//         : []
//       const shipping = shippingAddress.map(ship => ({
//         default: ship.default || '',
//         address: ship.address || '',
//         district: ship.district || '',
//         subDistrict: ship.subDistrict || '',
//         province: ship.provinceCode || '',
//         postCode: ship.postCode || '',
//         latitude: ship.latitude || '',
//         longtitude: ship.longtitude || ''
//       }))

//       const checkIn = {}

//       const storeData = new Store({
//         storeId: uuidv4(),
//         name: store.name,
//         taxId: store.taxId,
//         tel: store.tel,
//         route: store.route,
//         type: store.type,
//         typeName: store.typeName,
//         address: store.address,
//         district: store.district,
//         subDistrict: store.subDistrict,
//         province: store.province,
//         provinceCode: store.provinceCode,
//         postCode: store.postCode,
//         zone: store.zone,
//         area: store.area,
//         latitude: store.latitude,
//         longtitude: store.longtitude,
//         lineId: store.lineId,
//         note: store.note,
//         status: '10',
//         approve: approve,
//         policyConsent: policyAgree,
//         imageList: imageList,
//         shippingAddress: shipping,
//         checkIn: checkIn
//       })

//       await storeData.save()
//       // console.log(storeData)

//       const io = getSocket()
//       io.emit('store/addStore', {
//         status: '200',
//         message: 'Store added successfully'
//       })

//       res.status(200).json({
//         status: '200',
//         message: 'Store added successfully'
//         // data:storeData
//       })
//     } catch (error) {
//       console.error('Error saving store to MongoDB:', error)
//       res.status(500).json({ status: '500', message: 'Server Error' })
//     }
//   })
// }

exports.checkSimilarStores = async (req, res) => {
  const { storeId } = req.params
  const channel = req.headers['x-channel']
  const { Store } = getModelsByChannel(channel, res, storeModel)
  const store = await Store.findOne({ storeId })
  // console.log(store.zone)
  // const existingStores = await Store.find(
  //   { storeId: { $ne: storeId } },
  //   { _id: 0, __v: 0, idIndex: 0 },
  //   { zone: store.zone }
  // )

  const existingStores = await Store.find(
    {
      zone: store.zone,
      storeId: { $ne: storeId },
      $expr: { $lte: [{ $strLenCP: '$storeId' }, 12] } // ≤ 12 ตัวอักษร
    },
    { _id: 0, __v: 0, idIndex: 0 }
  )

  // console.log(existingStores.length)
  // 1. กำหนด weight ของแต่ละ field (ค่า sum ต้องไม่จำเป็นต้องรวมกันเท่ากับ 100)
  const fieldsToCheck = [
    { field: 'name', weight: 2 },
    { field: 'taxId', weight: 4 },
    { field: 'tel', weight: 3 },
    { field: 'address', weight: 2 }
    // { field: 'district', weight: 0.5 },
    // { field: 'subDistrict', weight: 0.5 },
    // { field: 'province', weight: 0.5 },
    // { field: 'postCode', weight: 0.5 },
    // { field: 'latitude', weight: 4 },
    // { field: 'longtitude', weight: 4 }
  ]

  const totalWeight = fieldsToCheck.reduce((sum, cur) => sum + cur.weight, 0)

  const similarStores = existingStores
    .map(existingStore => {
      let weightedSimilarity = 0
      fieldsToCheck.forEach(({ field, weight }) => {
        const similarity = calculateSimilarity(
          store[field]?.toString() || '',
          existingStore[field]?.toString() || ''
        )
        weightedSimilarity += similarity * weight
      })

      // Average, normalized by total weight
      const averageSimilarity = weightedSimilarity / totalWeight

      return {
        store: existingStore,
        similarity: averageSimilarity
      }
    })
    .filter(result => result.similarity > 75) // threshold
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3)

  if (similarStores.length > 0) {
    const sanitizedStores = similarStores.map(item => ({
      store: Object.fromEntries(
        Object.entries(item.store._doc || item.store).filter(
          ([key]) => key !== '_id'
        )
      ),
      similarity: item.similarity.toFixed(2)
    }))

    // const io = getSocket()
    // io.emit('store/check', {});

    return res.status(200).json({
      status: '200',
      message: 'similar store',
      data: sanitizedStores
    })
  }
  return res.status(204).json({
    status: '204',
    message: 'Do not have similar store',
    data: []
  })
}
exports.editStore = async (req, res) => {
  const { storeId } = req.params
  const data = req.body

  try {
    const immutableFields = [
      'latitude',
      'longitude',
      'taxId',
      'approve',
      'policyAgree'
    ]

    immutableFields.forEach(field => delete data[field])

    Object.keys(data).forEach(key => {
      if (data[key] === '' || data[key] === null) {
        delete data[key]
      }
    })

    if (Object.keys(data).length === 0) {
      return res
        .status(400)
        .json({ status: '400', message: 'No valid fields to update' })
    }

    const channel = req.headers['x-channel'] // 'credit' or 'cash'

    const { Store } = getModelsByChannel(channel, res, storeModel)
    const store = await Store.findOneAndUpdate({ storeId }, data, { new: true })

    if (!store) {
      return res.status(404).json({ status: '404', message: 'Store not found' })
    }

    const io = getSocket()
    io.emit('store/editStore', {
      status: '200',
      message: 'Store updated successfully',
      data: store
    })

    res.status(200).json({
      status: '200',
      message: 'Store updated successfully',
      data: store
    })
  } catch (error) {
    console.error('Error updating store:', error)
    res.status(500).json({ status: '500', message: 'Server error' })
  }
}

exports.addFromERP = async (req, res) => {
  try {
    const dataArray = []
    const channel = req.headers['x-channel']
    let pathPhp = ''

    switch (channel) {
      case 'cash':
        pathPhp = 'ca_api/ca_customer.php'
        break
      case 'credit':
        pathPhp = 'cr_api/cr_customer.php'
        break
      default:
        break
    }
    const response = await axios.post(
      `http://58.181.206.159:9814/apps_api/${pathPhp}`
    )
    for (const splitData of response.data) {
      const approveData = {
        dateSend: new Date(),
        dateAction: new Date(),
        appPerson: 'system'
      }
      const poliAgree = {
        status: 'Agree',
        date: new Date()
      }
      const mainData = {
        storeId: splitData.storeId,
        name: splitData.name,
        taxId: splitData.taxId,
        tel: splitData.tel,
        route: splitData.route,
        type: splitData.type,
        typeName: splitData.typeName,
        address: splitData.address,
        district: splitData.district,
        subDistrict: splitData.subDistrict,
        province: splitData.province,
        provinceCode: splitData.provinceCode,
        'postCode ': splitData.postCode,
        zone: splitData.zone,
        area: splitData.area,
        latitude: splitData.latitude,
        longtitude: splitData.longtitude,
        lineId: '',
        'note ': '',
        approve: approveData,
        status: '20',
        policyConsent: poliAgree,
        imageList: [],
        shippingAddress: splitData.shippingAddress,
        checkIn: {},
        createdAt: splitData.createdAt,
        updatedDate: Date()
      }

      const channel = req.headers['x-channel'] // 'credit' or 'cash'

      const { Store } = getModelsByChannel(channel, res, storeModel)
      const StoreIf = await Store.findOne({ storeId: splitData.storeId })
      if (!StoreIf) {
        await Store.create(mainData)
      } else {
        const idStoreReplace = {
          idStore: splitData.storeId,
          name: splitData.name
        }
        dataArray.push(idStoreReplace)
      }
    }
    res.status(200).json({
      status: '200',
      message: 'Store Added Succesfully'
      // data: dataArray
    })
  } catch (error) {
    console.error('Error saving store to MongoDB:', error)
    res.status(500).json({
      status: '500',
      message: 'Server Error'
    })
  }
}

exports.addFromERPnew = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { Store } = getModelsByChannel(channel, res, storeModel)

    const erpStores = await storeQuery(channel) // ข้อมูลจาก ERP
    const erpMap = new Map(erpStores.map(item => [item.storeId, item]))

    const mongoStores = await Store.find()
    const mongoMap = new Map(mongoStores.map(item => [item.storeId, item]))

    const bulkOps = []
    const changes = {
      added: [],
      updated: [],
      deleted: []
    }

    // ➕ เตรียม insert/update
    for (const item of erpStores) {
      const existing = mongoMap.get(item.storeId)

      if (!existing) {
        // เตรียม insert
        bulkOps.push({
          insertOne: { document: item }
        })
        changes.added.push(item.storeId)
      } else {
        // ตรวจสอบว่ามี field ไหนเปลี่ยน
        let isModified = false
        const updatedFields = {}
        for (const key of Object.keys(item)) {
          if (key !== 'createdAt' && existing[key] !== item[key]) {
            updatedFields[key] = item[key]
          }
        }

        if (isModified) {
          bulkOps.push({
            updateOne: {
              filter: { _id: existing._id },
              update: { $set: updatedFields }
            }
          })
          changes.updated.push(item.storeId)
        }
      }
    }

    // ❌ เตรียมลบ store ที่ไม่มีใน ERP
    for (const store of mongoStores) {
      if (!erpMap.has(store.storeId)) {
        bulkOps.push({
          deleteOne: { filter: { _id: store._id } }
        })
        changes.deleted.push(store.storeId)
      }
    }

    // 🔁 ทำงานจริงในครั้งเดียว
    if (bulkOps.length > 0) {
      await Store.bulkWrite(bulkOps)
    }

    // 🔔 แจ้ง socket
    const io = getSocket()
    io.emit('store/addFromERPnew', {})

    res.status(200).json({
      status: 200,
      message: 'Sync Store Success',
      changes
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: 500, message: error.message })
  }
}

exports.checkInStore = async (req, res) => {
  const { storeId } = req.params
  const { latitude, longtitude } = req.body

  const channel = req.headers['x-channel'] // 'credit' or 'cash'

  const { Store } = getModelsByChannel(channel, res, storeModel)
  try {
    if (!latitude || !longtitude) {
      return res.status(400).json({
        status: '400',
        message: 'latitude and longtitude are required!'
      })
    }

    const result = await Store.findOneAndUpdate(
      { storeId },
      {
        $set: {
          'checkIn.latitude': latitude,
          'checkIn.longtitude': longtitude,
          'checkIn.updateDate': new Date()
        }
      }
    )

    if (!result) {
      return res
        .status(404)
        .json({ status: '404', message: 'store not found!' })
    }

    const io = getSocket()
    io.emit('store/checkIn', {
      status: '200',
      message: 'Checked In Successfully',
      data: {
        latitude: result.checkIn.latitude,
        longtitude: result.checkIn.latitude,
        updateDate: result.checkIn.updateDate
      }
    })

    res.status(200).json({
      status: '200',
      message: 'Checked In Successfully',
      data: {
        latitude: result.checkIn.latitude,
        longtitude: result.checkIn.latitude,
        updateDate: result.checkIn.updateDate
      }
    })
  } catch (error) {
    console.error('Error updating store:', error)
    res.status(500).json({ status: '500', message: 'Server error' })
  }
}
exports.reLatLong = async (req, res) => {
  try {
    const { storeId } = req.body
    const channel = req.headers['x-channel']
    const { Store } = getModelsByChannel(channel, res, storeModel)
    const stores = await Store.updateOne(
      { storeId: storeId },
      {
        $set: {
          latitude: '0.0000',
          longtitude: '0.0000',
          'shippingAddress.0.latitude': '0.0000',
          'shippingAddress.0.longtitude': '0.0000'
        }
      }
    )
    res.status(200).json({
      status: '200',
      message: 'Update Successfully',
      data: {
        stores
      }
    })
  } catch (error) {
    console.error('Error updating store:', error)
    res.status(500).json({ status: '500', message: 'Server error' })
  }
}

// exports.insertStoreToM3 = async (req, res) => {
//   const { storeId } = req.body
//   const channel = req.headers['x-channel']
//   const { Store } = getModelsByChannel(channel, res, storeModel)
//   const { User } = getModelsByChannel(channel, res, userModel)
//   const store = await Store.findOne({ storeId: storeId })

//   const item = await Store.findOne({ storeId: storeId, area: store.area })
//   const dataUser = await User.findOne({ area: store.area, role: 'sale' })

//   if (!item) {
//     return res.status(404).json({
//       json: 404,
//       message: 'Not found Store'
//     })
//   }

//   const dataTran = {
//     Hcase: 1,
//     customerNo: item.storeId,
//     customerStatus: item.status ?? '',
//     customerName: item.name.substring(0, 35) ?? '',
//     customerChannel: '103',
//     customerCoType: item.type ?? '',
//     customerAddress1: (
//       item.address +
//       item.subDistrict +
//       item.subDistrict +
//       item.province +
//       item.postCode ?? ''
//     ).substring(0, 35),
//     customerAddress2: (
//       item.address +
//       item.subDistrict +
//       item.subDistrict +
//       item.province +
//       item.postCode ?? ''
//     ).substring(35, 70),
//     customerAddress3: (
//       item.address +
//       item.subDistrict +
//       item.subDistrict +
//       item.province +
//       item.postCode ?? ''
//     ).substring(70, 105),
//     customerAddress4: item.name.substring(35, 70),
//     customerPoscode: (item.postCode ?? '').substring(0, 35),
//     customerPhone: item.tel ?? '',
//     warehouse: dataUser.warehouse ?? '',
//     OKSDST: item.zone ?? '',
//     saleTeam: dataUser.area.slice(0, 2) + dataUser.area[3],
//     OKCFC1: item.area ?? '',
//     OKCFC3: item.route ?? '',
//     OKCFC6: item.type ?? '',
//     salePayer: dataUser.salePayer ?? '',
//     creditLimit: '000',
//     taxno: item.taxId ?? '',
//     saleCode: dataUser.saleCode ?? '',
//     saleZone: dataUser.zone ?? '',
//     shippings: item.shippingAddress.map(u => {
//       return {
//         shippingAddress1: (
//           u.address + u.subDistrict + u.subDistrict + u.province + u.postCode ??
//           ''
//         ).substring(0, 35),
//         shippingAddress2: (
//           u.address + u.subDistrict + u.subDistrict + u.province + u.postCode ??
//           ''
//         ).substring(35, 70),
//         shippingAddress3: (
//           u.address + u.subDistrict + u.subDistrict + u.province + u.postCode ??
//           ''
//         ).substring(70, 105),
//         shippingAddress4: u.province ?? '',
//         shippingPoscode: u.postCode ?? '',
//         shippingPhone: item.tel ?? '',
//         shippingRoute: u.postCode,
//         OPGEOX: u.latitude,
//         OPGEOY: u.longtitude
//       }
//     })
//   }

//   // console.log(dataTran)

//   if (item.area != 'IT211') {
//     try {
//       const response = await axios.post(
//         `${process.env.API_URL_12ERP}/customer/insert`,
//         dataTran
//       )

//       // ส่งกลับไปให้ client ที่เรียก Express API
//       return res.status(response.status).json(response.data)
//     } catch (error) {
//       if (error.response) {
//         // หาก ERP ส่ง 400 หรือ 500 หรืออื่นๆ กลับมา
//         return res.status(error.response.status).json({
//           message: error.response.data?.message || 'Request Failed',
//           data: error.response.data
//         })
//       }
//     }
//   }
// }

exports.insertStoreToM3 = async (req, res) => {
  const { storeId } = req.body || {}
  const channel = req.headers['x-channel']

  try {
    if (!storeId) {
      return res.status(400).json({ message: 'storeId is required' })
    }
    if (!channel) {
      return res.status(400).json({ message: 'x-channel header is required' })
    }

    const { Store } = getModelsByChannel(channel, res, storeModel)
    const { User } = getModelsByChannel(channel, res, userModel)

    // หา store แค่ครั้งเดียว และเช็ค null ก่อนใช้
    const store = await Store.findOne({ storeId })
    if (!store) {
      return res.status(404).json({ message: 'Not found Store' })
    }

    const dataUser = await User.findOne({ area: store.area, role: 'sale' })
    if (!dataUser) {
      return res
        .status(404)
        .json({ message: `Not found sale user for area ${store.area}` })
    }

    // helper: ต่อที่อยู่ให้สะอาด + ตัดเป็นช่วงละ 35 ตัว
    const concatAddress = (...parts) => parts.filter(Boolean).join(' ').trim()
    const seg35 = (s, from) => (s || '').substring(from, from + 35)

    const fullAddr = concatAddress(
      store.address,
      store.subDistrict,
      store.district, // เดิมซ้ำ subDistrict 2 รอบ
      store.province,
      store.postCode
    )
    const name = store.name || ''

    const shippingsArr = Array.isArray(store.shippingAddress)
      ? store.shippingAddress
      : []

    const dataTran = {
      Hcase: 1,
      customerNo: store.storeId,
      customerStatus: store.status ?? '',
      customerName: name.substring(0, 35),
      customerChannel: '103',
      customerCoType: store.type ?? '',
      customerAddress1: seg35(fullAddr, 0),
      customerAddress2: seg35(fullAddr, 35),
      customerAddress3: seg35(fullAddr, 70),
      customerAddress4: name.substring(35, 70),
      customerPoscode: (store.postCode ?? '').substring(0, 10),
      customerPhone: store.tel ?? '',
      warehouse: dataUser.warehouse ?? '',
      OKSDST: store.zone ?? '',
      saleTeam:
        dataUser.area && dataUser.area.length >= 4
          ? dataUser.area.slice(0, 2) + dataUser.area[3]
          : '',
      OKCFC1: store.area ?? '',
      OKCFC3: store.route ?? '',
      OKCFC6: store.type ?? '',
      salePayer: dataUser.salePayer ?? '',
      creditLimit: '000',
      taxno: store.taxId ?? '',
      saleCode: dataUser.saleCode ?? '',
      saleZone: dataUser.zone ?? '',
      shippings: shippingsArr.map(u => {
        const shipAddr = concatAddress(
          u.address,
          u.subDistrict,
          u.district,
          u.province,
          u.postCode
        )
        return {
          shippingAddress1: seg35(shipAddr, 0),
          shippingAddress2: seg35(shipAddr, 35),
          shippingAddress3: seg35(shipAddr, 70),
          shippingAddress4: u.province ?? '',
          shippingPoscode: u.postCode ?? '',
          shippingPhone: store.tel ?? '',
          shippingRoute: u.postCode ?? '',
          OPGEOX:
            u.latitude == 'Error fetching latitude' ? '0.0000' : u.latitude,
          OPGEOY: u.longitude == 'Error fetching latitude' ? '0.0000' : u.longitude // เดิมสะกด longtitude
        }
      })
    }

    // เคสที่เดิมค้าง: area = IT211 → ตอบกลับเลย จะได้ไม่ timeout
    if (store.area === 'IT211') {
      return res
        .status(200)
        .json({ message: 'Skip ERP insert for area IT211', data: dataTran })
    }

    const baseURL = process.env.API_URL_12ERP
    if (!baseURL) {
      return res
        .status(500)
        .json({ message: 'API_URL_12ERP is not configured' })
    }

    // ตั้ง timeout ให้ upstream ERP (ป้องกันการค้าง)
    const http = axios.create({
      baseURL,
      timeout: 15000 // 15s พอเหมาะ ถ้าช้ากว่านี้ให้ ERP แก้หรือเพิ่ม timeout ตามจำเป็น
    })

    const erpRes = await http.post('/customer/insert', dataTran)

    return res.status(erpRes.status).json(erpRes.data)
  } catch (error) {
    // มี response กลับมาจาก ERP (4xx/5xx)
    if (error?.response) {
      return res.status(error.response.status).json({
        message: error.response.data?.message || 'Request Failed',
        data: error.response.data
      })
    }

    // ไม่มี response = timeout / network
    if (error?.code === 'ECONNABORTED') {
      return res.status(504).json({ message: 'Upstream ERP timed out' })
    }
    if (error?.request) {
      return res
        .status(502)
        .json({ message: 'Bad gateway: no response from ERP' })
    }

    // error อื่นๆ
    console.error('[insertStoreToM3] Unexpected error:', error)
    return res.status(500).json({ message: 'Internal server error' })
  }
}

exports.updateStoreStatus = async (req, res) => {
  const { storeId, status, user } = req.body
  const channel = req.headers['x-channel']
  const { RunningNumber, Store } = getModelsByChannel(channel, res, storeModel)
  const { User } = getModelsByChannel(channel, res, userModel)
  const { ApproveLogs } = getModelsByChannel(channel, res, approveLogModel)
  const store = await Store.findOne({ storeId: storeId })
  // console.log(store)
  if (!store) {
    return res.status(404).json({
      status: 404,
      message: 'Not found store'
    })
  }
  const storeZone = store.area.substring(0, 2)
  const maxRunningAll = await RunningNumber.findOne({ zone: storeZone }).select(
    'last'
  )

  // console.log(maxRunningAll)

  const oldId = maxRunningAll
  // console.log(oldId, 'oldId')
  const newId = oldId.last.replace(/\d+$/, n =>
    String(+n + 1).padStart(n.length, '0')
  )

  // console.log(newId, 'newId')

  // console.log("oldId",oldId)
  if (status === '20') {
    await RunningNumber.findOneAndUpdate(
      { zone: store.zone },
      { $set: { last: newId } },
      { new: true }
    )
    await Store.findOneAndUpdate(
      { _id: store._id },
      {
        $set: {
          storeId: newId,
          status: status,
          updatedDate: Date(),
          'approve.dateAction': new Date(),
          'approve.appPerson': user
        }
      },
      { new: true }
    )

    const item = await Store.findOne({ storeId: newId, area: store.area })
    // const item = await Store.findOne({ storeId: storeId, area: store.area })
    const dataUser = await User.findOne({ area: store.area, role: 'sale' })

    if (!item) {
      return res.status(404).json({
        json: 404,
        message: 'Not found Store'
      })
    }

    // if (!item.postCode) {
    //   return res.status(404).json({
    //     json: 404,
    //     message: 'Not found postCode'
    //   })
    // }

    // console.log((item.province ?? '').substring(0, 35))
    const dataTran = {
      Hcase: 1,
      customerNo: item.storeId,
      customerStatus: item.status ?? '',
      customerName: item.name ?? '',
      customerChannel: '103',
      customerCoType: item.type ?? '',
      customerAddress1: (
        item.address +
        item.subDistrict +
        item.subDistrict +
        item.province +
        item.postCode ?? ''
      ).substring(0, 35),
      customerAddress2: (
        item.address +
        item.subDistrict +
        item.subDistrict +
        item.province +
        item.postCode ?? ''
      ).substring(35, 70),
      customerAddress3: (
        item.address +
        item.subDistrict +
        item.subDistrict +
        item.province +
        item.postCode ?? ''
      ).substring(70, 105),
      customerAddress4: '',
      customerPoscode: (item.postCode ?? '').substring(0, 35),
      customerPhone: item.tel ?? '',
      warehouse: dataUser.warehouse ?? '',
      OKSDST: item.zone ?? '',
      saleTeam: dataUser.area.slice(0, 2) + dataUser.area[3],
      OKCFC1: item.area ?? '',
      OKCFC3: item.route ?? '',
      OKCFC6: item.type ?? '',
      salePayer: dataUser.salePayer ?? '',
      creditLimit: '000',
      taxno: item.taxId ?? '',
      saleCode: dataUser.saleCode ?? '',
      saleZone: dataUser.zone ?? '',
      OKFRE1: item.postCode,
      OKECAR: item.postCode.slice(0, 2),
      OKCFC4: item.area ?? '',
      OKTOWN: item.province,
      shippings: item.shippingAddress.map(u => {
        return {
          shippingAddress1: (u.address ?? '').substring(0, 35),
          shippingAddress2: u.district ?? '',
          shippingAddress3: u.subDistrict ?? '',
          shippingAddress4: u.province ?? '',
          shippingPoscode: u.postCode ?? '',
          shippingPhone: item.tel ?? '',
          shippingRoute: u.postCode,
          OPGEOX: u.latitude,
          OPGEOY: u.longtitude
        }
      })
    }

    // console.log(dataTran)

    if (item.area != 'IT211') {
      try {
        const response = await axios.post(
          `${process.env.API_URL_12ERP}/customer/insert`,
          dataTran
        )

        // ส่งกลับไปให้ client ที่เรียก Express API
        return res.status(response.status).json(response.data)
      } catch (error) {
        if (error.response) {
          // หาก ERP ส่ง 400 หรือ 500 หรืออื่นๆ กลับมา
          return res.status(error.response.status).json({
            message: error.response.data?.message || 'Request Failed',
            data: error.response.data
          })
        }
      }
    }

    const io = getSocket()
    // io.emit('store/updateStoreStatus', {
    //   status: 'success',
    //   data: newId
    // })

    //   return res.status(500).json({
    //     message: 'Internal Server Error',
    //     error: error.message
    //   })
    // }
    await ApproveLogs.create({
      module: 'approveStore',
      user: user,
      status: 'approved',
      id: item.storeId,
    })


    return res.status(200).json({
      status: 200,
      message: 'update Store Status sucess'
    })
  } else {
    await Store.findOneAndUpdate(
      { _id: store._id },
      {
        $set: {
          status: status,
          updatedDate: Date(),
          'approve.dateAction': new Date(),
          'approve.appPerson': user
        }
      },
      { new: true }
    )

    await ApproveLogs.create({
      module: 'approveStore',
      user: user,
      status: 'rejected',
      id: item.storeId,
    })

    res.status(200).json({
      status: 200,
      message: 'Reject Store successful'
    })
  }
}

exports.rejectStore = async (req, res) => {
  const { storeId, area } = req.body

  const channel = req.headers['x-channel'] // 'credit' or 'cash'

  const { Store } = getModelsByChannel(channel, res, storeModel)

  const result = await Store.updateOne(
    { storeId: storeId },
    { $set: { status: '15', updatedDate: Date() } }
  )
  res.status(200).json({
    status: 200,
    message: 'Reject Success',
    data: result
  })
}

exports.updateStoreStatusNoNewId = async (req, res) => {
  try {
    const { storeId, status, user } = req.body
    const channel = req.headers['x-channel']
    const { Store } = getModelsByChannel(channel, res, storeModel)

    const store = await Store.findOne({ storeId })
    const now = new Date()
    const thailandOffsetMs = 7 * 60 * 60 * 1000
    const thailandTime = new Date(now.getTime() + thailandOffsetMs)

    if (!store) {
      return res.status(404).json({
        status: 404,
        message: 'Store not found'
      })
    }

    const result = await Store.findOneAndUpdate(
      { storeId },
      {
        status,
        updatedDate: Date(),
        'approve.dateAction': new Date(),
        'approve.appPerson': user,
        route: 'R25'
      },
      { new: true }
    )

    await Customer.update(
      {
        customerStatus: `${status}`,
        OKCFC3: 'R25',
        OKLMDT: thailandTime.toISOString().slice(0, 10).replace(/-/g, ''), // YYYYMMDD
        OKCHID: 'MI02'
      },
      {
        where: {
          coNo: 410,
          customerNo: storeId
        }
      }
    )

    return res.status(200).json({
      status: 200,
      message: 'Store status updated successfully'
    })
  } catch (error) {
    console.error('updateStoreStatusNoNewId error:', error)
    return res.status(500).json({
      status: 500,
      message: 'Internal server error'
    })
  }
}

exports.addAndUpdateStore = async (req, res) => {
  const channel = req.headers['x-channel']

  const { Store } = getModelsByChannel(channel, res, storeModel)
  let pathPhp = ''

  switch (channel) {
    case 'cash':
      pathPhp = 'ca_api/ca_customer.php'
      break
    case 'credit':
      pathPhp = 'cr_api/cr_customer.php'
      break
    default:
      break
  }
  // area = ['NS121','SH101']
  // area = 'NS121'
  const response = await axios.post(
    `http://58.181.206.159:9814/apps_api/${pathPhp}`
    // {
    //   area:area
    // }
  )

  // console.log(response.data)
  const storeMongo = await Store.find()
  let update = 0
  let addNew = 0
  for (const splitData of response.data) {
    const approveData = {
      dateSend: new Date(),
      dateAction: new Date(),
      appPerson: 'system'
    }
    const poliAgree = {
      status: 'Agree',
      date: new Date()
    }
    const m3 = {
      storeId: splitData.storeId,
      name: splitData.name,
      taxId: splitData.taxId,
      tel: splitData.tel,
      route: splitData.route,
      type: splitData.type,
      typeName: splitData.typeName,
      address: splitData.address,
      district: splitData.district,
      subDistrict: splitData.subDistrict,
      province: splitData.province,
      provinceCode: splitData.provinceCode,
      'postCode ': splitData.postCode,
      zone: splitData.zone,
      area: splitData.area,
      latitude: splitData.latitude,
      longtitude: splitData.longtitude,
      lineId: '',
      'note ': '',
      approve: approveData,
      status: '20',
      policyConsent: poliAgree,
      imageList: [],
      shippingAddress: splitData.shippingAddress,
      checkIn: {},
      createdAt: splitData.createdAt,
      updatedDate: Date()
    }

    const storeInMongo = storeMongo.find(id => id.storeId == m3.storeId)

    if (storeInMongo) {
      const includedKeys = ['route', 'zone', 'area']

      const hasChanged = includedKeys.some(key => m3[key] !== storeInMongo[key])

      if (hasChanged) {
        await Store.updateOne(
          { storeId: m3.storeId },
          {
            $set: {
              route: m3.route,
              zone: m3.zone,
              area: m3.area
            }
          }
        )
        update += 1
      }
    } else {
      await Store.create(m3)
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

exports.createRunningNumber = async (req, res) => {
  const channel = req.headers['x-channel']
  const { RunningNumber, Store } = getModelsByChannel(channel, res, storeModel)

  let type = ''
  let running = ''
  if (channel == 'cash') {
    type = '101'
    running = 'V'
  } else if (channel == 'credit') {
    type = '103'
  }

  const zoneId = await Store.aggregate([
    {
      $match: {
        zone: { $ne: null, $nin: ['', null] }
      }
    },
    {
      $group: {
        _id: '$zone'
      }
    }
  ])

  // console.log(zoneId)

  const maxRunningAll = await Store.aggregate([
    {
      $match: {
        zone: { $ne: null, $nin: ['', null] }
      }
    },
    {
      $group: {
        _id: '$zone',
        maxStoreId: { $max: '$storeId' }
      }
    }
  ])

  const data = zoneId.map(u => {
    const maxRunning = maxRunningAll.find(m => m._id === u._id)
    return {
      zone: u._id,
      type: type,
      name: channel,
      // start: `${running}${u._id}2500000`,
      // last: `${running}${u._id}2500000`
      start: maxRunning.maxStoreId,
      last: maxRunning.maxStoreId
    }
  })

  for (const runing of data) {
    const exists = await RunningNumber.findOne({ zone: runing.zone })

    if (!exists) {
      await RunningNumber.create(runing)
    }
  }

  res.status(200).json({
    status: 200,
    message: data
  })
}

exports.updateRunningNumber = async (req, res) => {
  const { storeId } = req.body
  const channel = req.headers['x-channel']
  const { RunningNumber, Store } = getModelsByChannel(channel, res, storeModel)
  const store = await Store.findOne({ storeId: storeId })

  if (!store) {
    return res.status(404).json({
      status: 404,
      message: 'Not found store'
    })
  }

  const maxRunningAll = await Store.aggregate([
    {
      $match: {
        zone: store.zone
      }
    },
    {
      $group: {
        _id: '$zone',
        maxStoreId: { $max: '$storeId' }
      }
    }
  ])
  const oldId = maxRunningAll.flatMap(u => u.maxStoreId)
  const newId = oldId[0].replace(/\d+$/, n =>
    String(+n + 1).padStart(n.length, '0')
  )

  await Store.findOneAndUpdate(
    { storeId: storeId },
    { $set: { storeId: newId, status: '20', updatedDate: Date() } },
    { new: true }
  )

  await RunningNumber.findOneAndUpdate(
    { zone: store.zone },
    { $set: { last: newId } },
    { new: true }
  )

  res.status(200).json({
    status: 200,
    message: 'Update storeId successful'
  })
}

exports.addBueatyStore = async (req, res) => {
  const channel = req.headers['x-channel']

  try {
    const bueatydata = await bueatyStoreQuery()
    const { TypeStore } = getModelsByChannel(channel, res, storeModel)

    await TypeStore.deleteMany({})

    await TypeStore.insertMany(
      bueatydata.map(x => {
        const trimmed = Object.fromEntries(
          Object.entries(x).map(([key, value]) => [
            key,
            typeof value === 'string' ? value.trim() : value
          ])
        )
        return { ...trimmed, type: ['beauty'] }
      })
    )

    const io = getSocket()
    io.emit('store/addBueatyStore', {})

    res.status(200).json({
      status: 200,
      message: bueatydata
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: 500, message: error.message })
  }
}

exports.getBueatyStore = async (req, res) => {
  const channel = req.headers['x-channel']

  const { Store, TypeStore } = getModelsByChannel(channel, res, storeModel)

  const storeBueaty = await TypeStore.aggregate([
    {
      $lookup: {
        from: 'stores',
        localField: 'storeId',
        foreignField: 'storeId',
        as: 'storeDetail'
      }
    }
  ])

  res.status(200).json({
    status: 200,
    message: storeBueaty
  })
}

exports.addStoreArray = async (req, res) => {
  const { storeId } = req.body
  const channel = req.headers['x-channel']
  const { Store } = getModelsByChannel(channel, res, storeModel)
  const result = await storeQueryFilter(channel, storeId)

  const insertedStores = []
  const existingStores = []

  for (const item of result) {
    const storeInDb = await Store.findOne({ storeId: item.storeId })

    if (!storeInDb) {
      await Store.create(item)
      insertedStores.push({
        idStore: item.storeId,
        name: item.name
      })
    } else {
      existingStores.push({
        idStore: item.storeId,
        name: item.name
      })
    }
  }

  const io = getSocket()
  io.emit('store/addStoreArray', {})

  res.status(200).json({
    status: 200,
    message: 'Store sync completed',
    inserted: insertedStores,
    alreadyExists: existingStores
  })
}

exports.updateStoreArray = async (req, res) => {
  const { storeId } = req.body
  const channel = req.headers['x-channel']
  const { Store } = getModelsByChannel(channel, res, storeModel)
  const result = await storeQueryFilter(channel, storeId)

  const updatedStores = []
  const unchangedStores = []

  for (const item of result) {
    const storeInDb = await Store.findOne({ storeId: item.storeId })

    if (storeInDb) {
      const isChanged = Object.keys(item).some(key => {
        return item[key] !== storeInDb[key]
      })

      if (isChanged) {
        await Store.updateOne({ storeId: item.storeId }, { $set: item })
        updatedStores.push({
          idStore: item.storeId,
          name: item.name
        })
      } else {
        unchangedStores.push({
          idStore: item.storeId,
          name: item.name
        })
      }
    }
  }
  const io = getSocket()
  io.emit('store/updateStoreArray', {})

  res.status(200).json({
    status: 200,
    message: 'Store update check completed',
    updated: updatedStores,
    unchanged: unchangedStores
  })
}

exports.deleteStoreArray = async (req, res) => {
  const { storeId } = req.body
  const channel = req.headers['x-channel']
  const { Store } = getModelsByChannel(channel, res, storeModel)

  const storeToDelete = await Store.find({ storeId: { $in: storeId } })
  const deletedStoreId = storeToDelete.map(store => store.storeId)

  await Store.deleteMany({ storeId: { $in: storeId } })

  const io = getSocket()
  io.emit('store/deleteStoreArray', {
    status: 200,
    message: 'Deleted successfully',
    deletedStore: deletedStoreId
  })

  res.status(200).json({
    status: 200,
    message: 'Deleted successfully',
    deletedStore: deletedStoreId
  })
}

exports.addTypeStore = async (req, res) => {
  const channel = req.headers['x-channel']
  const result = await groupStoreType()
  const { StoreType } = getModelsByChannel(channel, res, storeModel)
  for (const item of result) {
    const exist = await StoreType.findOne({ id: item.id })
    if (!exist) {
      await StoreType.create(item)
    }
  }

  res.status(200).json({
    status: 200,
    message: 'successfully',
    deletedStore: result
  })
}

exports.getTypeStore = async (req, res) => {
  const channel = req.headers['x-channel']
  const { StoreType } = getModelsByChannel(channel, res, storeModel)
  const storeType = await StoreType.find().select('id name status -_id')

  res.status(200).json({
    status: 200,
    message: 'successfully',
    data: storeType
  })
}

exports.insertStoreToErpOne = async (req, res) => {
  const { storeId, area } = req.body
  const channel = req.headers['x-channel']
  const { Store } = getModelsByChannel(channel, res, storeModel)
  const { User } = getModelsByChannel(channel, res, userModel)
  const item = await Store.findOne({ storeId: storeId, area: area })
  const dataUser = await User.findOne({ area: area, role: 'sale' })

  if (!item) {
    return res.status(404).json({
      json: 404,
      message: 'Not found Store'
    })
  }

  if (!item.postCode) {
    return res.status(404).json({
      json: 404,
      message: 'Not found postCode'
    })
  }

  // console.log(item)
  const dataTran = {
    Hcase: 1,
    customerNo: item.storeId,
    customerStatus: item.status,
    customerName: item.name,
    customerChannel: '103',
    customerCoType: item.type,
    customerAddress1: item.address,
    customerAddress2: item.subDistrict,
    customerAddress3: item.district,
    customerAddress4: item.province,
    customerPoscode: item.postCode,
    customerPhone: item.tel,
    warehouse: dataUser.warehouse,
    OKSDST: item.zone,
    saleTeam: dataUser.area.slice(0, 2) + dataUser.area[3],
    OKCFC1: item.area,
    OKCFC3: item.route,
    OKCFC6: item.type,
    salePayer: dataUser.salePayer,
    creditLimit: '000',
    taxno: item.taxId,
    saleCode: dataUser.saleCode,
    saleZone: dataUser.zone,
    shippings: item.shippingAddress.map(u => {
      return {
        shippingAddress1: u.address,
        shippingAddress2: u.district,
        shippingAddress3: u.subDistrict,
        shippingAddress4: u.province ?? '',
        shippingPoscode: u.postCode,
        shippingPhone: item.tel,
        shippingRoute: item.postCode,
        OPGEOX: u.latitude,
        OPGEOY: u.longtitude
      }
    })
  }

  // console.log(dataTran)
  try {
    const response = await axios.post(
      `${process.env.API_URL_12ERP}/customer/insert`,
      dataTran
    )

    // ส่งกลับไปให้ client ที่เรียก Express API
    return res.status(response.status).json(response.data)
  } catch (error) {
    if (error.response) {
      // หาก ERP ส่ง 400 หรือ 500 หรืออื่นๆ กลับมา
      return res.status(error.response.status).json({
        message: error.response.data?.message || 'Request Failed',
        data: error.response.data
      })
    }

    // กรณีอื่นๆ ที่ไม่ใช่ response จาก ERP เช่น network error
    return res.status(500).json({
      message: 'Internal Server Error',
      error: error.message
    })
  }

  // res.status(200).json({
  //   status: 200,
  //   message: 'successfully',
  //   data: dataTran
  // })
}

exports.getShipping = async (req, res) => {
  const { storeId } = req.body
  // console.log(storeId)
  const channel = req.headers['x-channel']
  const { Store } = getModelsByChannel(channel, res, storeModel)

  const dataStore = await Store.findOne({ storeId: storeId }).select(
    'shippingAddress'
  )

  if (!dataStore) {
    return res.status(404).json({
      status: 404,
      message: 'Not found store'
    })
  }

  // const io = getSocket()
  // io.emit('store/getShipping', {});

  return res.status(200).json({
    status: 200,
    message: 'sucess',
    data: dataStore.shippingAddress
  })
}

exports.addShippingInStore = async (req, res) => {
  try {
    const {
      storeId,
      defaultId,
      shippingId,
      address,
      district,
      subDistrict,
      province,
      postCode,
      latitude,
      longtitude
    } = req.body

    const channel = req.headers['x-channel']
    const { Store } = getModelsByChannel(channel, res, storeModel)

    const existStore = await Store.aggregate([
      {
        $match: {
          storeId: storeId
        }
      }
    ])

    if (existStore.length === 0) {
      return res.status(404).json({
        status: 404,
        message: 'Not found store'
      })
    }

    const storeWithShipping = await Store.findOne({
      storeId: storeId,
      'shippingAddress.shippingId': shippingId
    })
    if (storeWithShipping) {
      return res.status(409).json({
        status: 409,
        message: 'This shippingId already exists for this store.'
      })
    }

    const addShipping = await Store.findOneAndUpdate(
      { storeId: storeId },
      {
        $push: {
          shippingAddress: {
            default: defaultId,
            shippingId: shippingId,
            address: address,
            district: district,
            subDistrict: subDistrict,
            province: province,
            postCode: postCode,
            latitude: latitude,
            longtitude: longtitude
          }
        }
      },
      { new: true }
    )

    const io = getSocket()
    io.emit('store/addShippingInStore', {
      status: 200,
      message: 'sucess',
      data: addShipping
    })

    return res.status(200).json({
      status: 200,
      message: 'sucess',
      data: addShipping
    })
  } catch (error) {
    console.error('addShippingInStore error:', error)
    return res
      .status(500)
      .json({ status: 500, message: 'Internal server error' })
  }
}

exports.editShippingInStore = async (req, res) => {
  try {
    const {
      storeId,
      defaultId,
      shippingId,
      address,
      district,
      subDistrict,
      province,
      postCode,
      latitude,
      longitude
    } = req.body

    const channel = req.headers['x-channel']
    const { Store } = getModelsByChannel(channel, res, storeModel)

    const existStore = await Store.findOne({
      storeId: storeId,
      'shippingAddress.shippingId': shippingId
    })

    if (!existStore) {
      return res.status(404).json({
        status: 404,
        message: 'Not found this shippingId in this store'
      })
    }

    let setObj = {}
    if (defaultId !== undefined && defaultId !== '')
      setObj['shippingAddress.$.default'] = defaultId
    if (address !== undefined && address !== '')
      setObj['shippingAddress.$.address'] = address
    if (district !== undefined && district !== '')
      setObj['shippingAddress.$.district'] = district
    if (subDistrict !== undefined && subDistrict !== '')
      setObj['shippingAddress.$.subDistrict'] = subDistrict
    if (province !== undefined && province !== '')
      setObj['shippingAddress.$.province'] = province
    if (postCode !== undefined && postCode !== '')
      setObj['shippingAddress.$.postCode'] = postCode
    if (latitude !== undefined && latitude !== '')
      setObj['shippingAddress.$.latitude'] = latitude
    if (longitude !== undefined && longitude !== '')
      setObj['shippingAddress.$.longitude'] = longitude

    if (Object.keys(setObj).length === 0) {
      return res.status(400).json({
        status: 400,
        message: 'No valid fields to update'
      })
    }

    const updatedStore = await Store.findOneAndUpdate(
      { storeId: storeId, 'shippingAddress.shippingId': shippingId },
      { $set: setObj },
      { new: true }
    )

    const io = getSocket()
    io.emit('store/editShippingInStore', {
      status: 200,
      message: 'success',
      data: updatedStore
    })

    return res.status(200).json({
      status: 200,
      message: 'success',
      data: updatedStore
    })
  } catch (error) {
    console.error('editShippingInStore error:', error)
    return res
      .status(500)
      .json({ status: 500, message: 'Internal server error' })
  }
}

exports.deleteShippingFromStore = async (req, res) => {
  try {
    const { storeId, shippingId } = req.body

    const channel = req.headers['x-channel']
    const { Store } = getModelsByChannel(channel, res, storeModel)

    // เช็กว่าร้านนี้มี shippingId นี้จริงหรือไม่
    const existStore = await Store.findOne({
      storeId: storeId,
      'shippingAddress.shippingId': shippingId
    })

    if (!existStore) {
      return res.status(404).json({
        status: 404,
        message: 'Not found this shippingId in this store'
      })
    }

    // ลบ shippingAddress ที่ตรงกับ shippingId นี้
    const updatedStore = await Store.findOneAndUpdate(
      { storeId: storeId },
      { $pull: { shippingAddress: { shippingId: shippingId } } },
      { new: true }
    )

    const io = getSocket()
    io.emit('store/deleteShippingFromStore', {
      status: 200,
      message: 'success',
      data: updatedStore
    })

    return res.status(200).json({
      status: 200,
      message: 'success',
      data: updatedStore
    })
  } catch (error) {
    console.error('deleteShippingFromStore error:', error)
    return res
      .status(500)
      .json({ status: 500, message: 'Internal server error' })
  }
}

exports.deleteStore = async (req, res) => {
  try {
    const { storeId } = req.body
    const channel = req.headers['x-channel']
    const { Store } = getModelsByChannel(channel, res, storeModel)

    const store = await Store.findOne({ storeId })

    if (!store) {
      return res.status(404).json({
        status: 404,
        message: 'Store not found'
      })
    }

    // เปลี่ยนสถานะเป็น 90 (soft delete)
    await Store.updateOne({ storeId }, { status: 'delete' })

    return res.status(200).json({
      status: 200,
      message: 'Store marked as deleted (status delete)'
    })
  } catch (error) {
    console.error('deleteStore error:', error)
    return res.status(500).json({
      status: 500,
      message: 'Internal server error'
    })
  }
}

exports.fixStatusStore = async (req, res) => {
  const t = await sequelize.transaction()
  try {
    const { storeId } = req.body
    const channel = req.headers['x-channel']
    const { Store } = getModelsByChannel(channel, res, storeModel)

    // อ่านจาก MongoDB (ไม่ต้องผูก transaction อะไรทั้งนั้น)
    const store = await Store.findOne({ storeId })
    if (!store) {
      await t.rollback()
      return res.status(404).json({ status: 404, message: 'Store not found' })
    }

    const now = new Date()

    const [updatedCount] = await Customer.update(
      {
        OKCFC3: 'R25',
        OKLMDT: now.toISOString().slice(0, 10).replace(/-/g, ''), // YYYYMMDD
        OKCHID: 'MI02',
        customerStatus: '20'
      },
      {
        where: { OKCUNO: store.storeId },
        transaction: t
      }
    )

    if (updatedCount === 0) {
      await t.rollback()
      return res.status(400).json({ status: 400, message: 'Update failed' })
    }

    await t.commit()
    return res
      .status(200)
      .json({ status: 200, message: 'Success', updatedCount })
  } catch (err) {
    await t.rollback()
    return res.status(500).json({ status: 500, message: err.message })
  }
}

exports.storeToExcel = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { Store } = getModelsByChannel(channel, res, storeModel)

    // รับ date ในรูปแบบ MMYYYY เช่น '072025'
    let dateStr = (req.query.date || '').trim()
    // console.log(req.query.date);

    // ถ้าไม่ถูกฟอร์แมต ให้ใช้เดือนปัจจุบัน “ตามเวลาไทย”
    if (!/^\d{6}$/.test(dateStr)) {
      const nowTH = new Date(
        new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
      )
      const y = nowTH.getFullYear()
      const m = String(nowTH.getMonth() + 1).padStart(2, '0')
      dateStr = `${m}${y}` // MMYYYY
    }

    // console.log(startTH)

    const mm = dateStr.slice(0, 2) // '07'
    const yyyy = dateStr.slice(2, 6) // '2025'

    // ช่วงเดือน “ตามเวลาไทย” แล้วใช้เป็น boundary ใน UTC ได้เลย
    const startTH = new Date(`${yyyy}-${mm}-01T00:00:00+07:00`) // inclusive

    const nextMonth =
      Number(mm) === 12 ? '01' : String(Number(mm) + 1).padStart(2, '0')
    const nextYear = Number(mm) === 12 ? String(Number(yyyy) + 1) : yyyy
    const endTHExclusive = new Date(
      `${nextYear}-${nextMonth}-01T00:00:00+07:00`
    ) // exclusive

    // คิวรีตามช่วงเดือนไทย (เอกสาร createdAt เก็บเป็น Date/UTC)
    const store = await Store.find({
      createdAt: { $gte: startTH, $lt: endTHExclusive }
    }).lean()

    const toThaiTime = d => new Date(new Date(d).getTime() + 7 * 60 * 60 * 1000)

    const storeTran = store.map(item => ({
      storeId: item.storeId,
      name: item.name,
      taxId: item.taxId,
      tel: item.tel,
      route: item.route,
      type: item.type,
      typeName: item.typeName,
      zone: item.zone,
      area: item.area,
      latitude: item.latitude,
      longtitude: item.longtitude,
      lineId: item.lineId,
      status: item.status,
      createdAt: toThaiTime(item.createdAt) // ✅ บวก 7 ชั่วโมง (เวลาไทย)
    }))

    // return res.status(200).json({ status: 200, count: store.length, data: store })

    const wb = xlsx.utils.book_new()
    const ws = xlsx.utils.json_to_sheet(storeTran)
    xlsx.utils.book_append_sheet(wb, ws, `Store${dateStr}`)

    const tempPath = path.join(os.tmpdir(), `Store${dateStr}.xlsx`)
    xlsx.writeFile(wb, tempPath)

    res.download(tempPath, `Store${dateStr}.xlsx`, err => {
      if (err) {
        console.error('❌ Download error:', err)
        // อย่าพยายามส่ง response ซ้ำถ้า header ถูกส่งแล้ว
        if (!res.headersSent) {
          res.status(500).send('Download failed')
        }
      }

      // ✅ ลบไฟล์ทิ้งหลังจากส่งเสร็จ (หรือส่งไม่สำเร็จ)
      fs.unlink(tempPath, () => { })
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ status: 500, message: err.message })
  }
}

exports.updateStatusM3ToMongo = async (req, res) => {
  const { storeId } = req.body
  const channel = req.headers['x-channel']
  const { Store } = getModelsByChannel(channel, res, storeModel)

  const storeData = await Store.findOne({ storeId: storeId })
  const storeDataM3 = await Customer.findOne({
    where: { customerNo: storeId }
  })

  if (storeData) {
    await Store.findOneAndUpdate(
      { storeId: storeId }, // filter
      { $set: { route: storeDataM3.OKCFC3 } }, // update
      { new: true } // optional: คืนค่าที่อัปเดตแล้ว (default คืนค่าก่อนอัปเดต)
    )

    return res.status(200).json({
      status: 200,
      message: 'success',
      data: storeUpdated
    })
  } else {
    return res.status(404).json({
      status: 404,
      message: 'Not found store'
      // data: storeUpdated
    })
  }
}



exports.addLatLong = async (req, res) => {

  const channel = req.headers['x-channel'] // 'credit' or 'cash'
  const { Store } = getModelsByChannel(channel, res, storeModel)
  const { User } = getModelsByChannel(channel, res, userModel)
  const { StoreLatLong } = getModelsByChannel(channel, res, storeLatLongModel)

  try {
    const { storeId, latitude, longtitude } = req.body

    const storeData = await Store.findOne({ storeId: storeId })
    // console.log(storeData)
    const sale = await User.findOne({ area: storeData.area }).select(
      'firstName surName warehouse tel saleCode salePayer'
    )

    const orderId = await generateOrderIdStoreLatLong(storeData.area, sale.warehouse, channel, res)

    const storeLatLong = new StoreLatLong({
      orderId: orderId,
      storeId: storeId,
      name: storeData.name,
      type: storeData.type,
      typeName: storeData.typeName,
      zone: storeData.zone,
      area: storeData.area,
      latitude: latitude,
      longtitude: longtitude,
      latitudeOld: storeData.latitude,
      longtitudeOld: storeData.longtitude,
      status: 'pending',
      statusTH: 'รอนำเข้า',
    })

    await storeLatLong.save()

    const io = getSocket()
    io.emit('store/addStore', {
      status: '200',
      message: 'Store added successfully'
    })

    return res.status(200).json({
      status: '200',
      message: 'Store added successfully',
      data: storeLatLong
    })
  } catch (error) {
    console.error('Error saving store to MongoDB:', error)
    return res
      .status(500)
      .json({ status: '500', message: 'Server Error', debug: error.message })
  }


}


exports.addImageLatLong = async (req, res) => {

  const channel = req.headers['x-channel'] // 'credit' or 'cash'
  const { Store } = getModelsByChannel(channel, res, storeModel)
  const { User } = getModelsByChannel(channel, res, userModel)
  const { StoreLatLong } = getModelsByChannel(channel, res, storeLatLongModel)
  const upload = getUploadMiddleware(channel)
  // console.log(upload)

  upload(req, res, async err => {
    try {

      const files = req.files || []
      const orderId = req.body.orderId
      const types = req.body.types ? req.body.types.split(',') : []

      const LatLongData = await StoreLatLong.findOne({ orderId: orderId })

      if (!LatLongData) {
        return res.status(404).message({
          status: 404,
          message: 'Not found lat long'
        })
      }

      const uploadedFiles = []
      for (let i = 0; i < files.length; i++) {
        const uploadedFile = await uploadFiles(
          [files[i]],
          path.join(__dirname, '../../public/images/storesLatLong'),
          LatLongData.area,
          types[i]
        )

        const originalPath = uploadedFile[0].fullPath // เช่น .../public/images/stores/xxx.jpg
        const webpPath = originalPath.replace(/\.[a-zA-Z]+$/, '.webp') // แปลงชื่อไฟล์นามสกุล .webp

        await sharp(originalPath)
          .rotate()
          .resize(800)
          .webp({ quality: 80 })
          .toFile(webpPath)

        fs.unlinkSync(originalPath)
        uploadedFiles.push({
          name: path.basename(webpPath),
          path: webpPath,
          type: types[i]
        })
      }

      const imageList = uploadedFiles

      if (uploadedFiles.length > 0) {
        await StoreLatLong.updateOne(
          { orderId: orderId },
          { $push: { imageList: { $each: uploadedFiles } } }
        )
      }


      const io = getSocket()
      io.emit('store/addStore', {
        status: '200',
        message: 'Image added successfully'
      })

      return res.status(200).json({
        status: '200',
        message: 'Image added successfully',
      })
    } catch (error) {
      console.error('Error saving store to MongoDB:', error)
      return res
        .status(500)
        .json({ status: '500', message: 'Server Error', debug: error.message })
    }
  })

}


exports.getLatLongOrder = async (req, res) => {
  const { storeId, zone, team, area } = req.query


  const channel = req.headers['x-channel'] // 'credit' or 'cash'
  const { Store } = getModelsByChannel(channel, res, storeModel)
  const { User } = getModelsByChannel(channel, res, userModel)
  const { StoreLatLong } = getModelsByChannel(channel, res, storeLatLongModel)

  let matchStage = {}

  if (storeId) {
    matchStage.storeId = storeId
  } else {
    if (zone) {
      matchStage.zone = zone
    } else if (team) {
      matchStage.team3 = team
    } else if (area) {
      matchStage.area = area
    }
  }

  // console.log(matchStage)

  const StoreLatLongData = await StoreLatLong.aggregate([
    {
      $addFields: {
        team3: {
          $concat: [
            { $substrCP: ['$area', 0, 2] },
            { $substrCP: ['$area', 3, 1] }
          ]
        },
        zone: {
          $substrCP: ['$area', 0, 2]
        }
      },

    },
    { $match: matchStage },
    { $sort: { createdAt: -1 } }
  ])

  const data = StoreLatLongData.map(item => {
    return {
      orderId: item.orderId,
      storeId: item.storeId,
      name: item.name,
      area: item.area,
      zone: item.zone,
      latitude: item.latitude,
      longtitude: item.longtitude,
      latitudeOld: item.latitudeOld,
      longtitudeOld: item.longtitudeOld,
      imageList: item.imageList.map(i => {
        return {
          name: i.name,
          path: i.path
        }
      }),
      approve: item.appPerson,
      status: item.status,
      statusTH: item.statusTH,
      createdAt: toThaiTime(item.createdAt)
    }
  })

  return res.status(200).json({
    status: '200',
    message: 'StoreLatLong added successfully',
    data: data
  })
}


exports.getLatLongOrderDetail = async (req, res) => {
  const { orderId } = req.query
  const channel = req.headers['x-channel'] // 'credit' or 'cash'
  const { Store } = getModelsByChannel(channel, res, storeModel)
  const { User } = getModelsByChannel(channel, res, userModel)
  const { StoreLatLong } = getModelsByChannel(channel, res, storeLatLongModel)


  const StoreLatLongData = await StoreLatLong.findOne({ orderId })
  // console.log(orderId)

  const data = {
    orderId: StoreLatLongData.orderId,
    storeId: StoreLatLongData.storeId,
    name: StoreLatLongData.name,
    area: StoreLatLongData.area,
    zone: StoreLatLongData.zone,
    latitude: StoreLatLongData.latitude,
    longtitude: StoreLatLongData.longtitude,
    imageList: StoreLatLongData.imageList.map(i => ({
      name: i.name,
      path: i.path
    })),
    approve: StoreLatLongData.appPerson,
    status: StoreLatLongData.status,
    statusTH: StoreLatLongData.statusTH,
    createdAt: toThaiTime(StoreLatLongData.createdAt)
  }

  return res.status(200).json({
    status: '200',
    message: 'StoreLatLong added successfully',
    data: data
  })
}



exports.approveLatLongStore = async (req, res) => {

  const { orderId, status, user } = req.body
  let statusStr = status === true ? 'approved' : 'rejected'
  let statusThStr = status === true ? 'อนุมัติ' : 'ไม่อนุมัติ'
  const channel = req.headers['x-channel']
  const { StoreLatLong } = getModelsByChannel(channel, res, storeLatLongModel)
  const { ApproveLogs } = getModelsByChannel(channel, res, approveLogModel)
  const { RunningNumber, Store } = getModelsByChannel(channel, res, storeModel)

  // console.log(orderId)

  const storeLatLongData = await StoreLatLong.findOne({
    orderId: orderId
  })

  if (!storeLatLongData) {
    return res.status(404).json({
      status: 404,
      message: 'Not found order'
    })
  }

  if (storeLatLongData.status !== 'pending') {
    return res.status(409).json({
      status: 409,
      message: 'Order is not pending'
    })
  }


  if (statusStr === 'approved') {

    // const storeData = await Store.findOne({ storeId: storeLatLongData.storeId })

    await StoreLatLong.findOneAndUpdate(
      { orderId: storeLatLongData.orderId },
      {
        $set: {
          status: statusStr,
          statusTH: statusThStr,
          'approve.dateAction': new Date(),
          'approve.appPerson': user
        }
      },
    )


    await Store.findOneAndUpdate(
      { storeId: storeLatLongData.storeId },
      {
        $set: {

          latitude: storeLatLongData.latitude,
          longtitude: storeLatLongData.longtitude,
        }
      },
    )
  } else {
    await StoreLatLong.findOneAndUpdate(
      { orderId: storeLatLongData.orderId },
      {
        $set: {
          status: statusStr,
          statusTH: statusThStr,
          'approve.dateAction': new Date(),
          'approve.appPerson': user
        }
      },
    )
  }

  await ApproveLogs.create({
    module: 'approveLatLongStore',
    user: user,
    status: statusStr,
    id: orderId,
  })

  res.status(201).json({
    status: 201,
    message: 'Update status sucess'
  })

}


exports.canceledOrderLatLongStore = async (req, res) => {

  const { orderId, status, user } = req.body
  const channel = req.headers['x-channel']
  const { StoreLatLong } = getModelsByChannel(channel, res, storeLatLongModel)
  const { ApproveLogs } = getModelsByChannel(channel, res, approveLogModel)
  const { RunningNumber, Store } = getModelsByChannel(channel, res, storeModel)

  const storeLatLongData = await StoreLatLong.findOne({
    orderId: orderId
  })

  if (!storeLatLongData) {
    return res.status(404).json({
      status: 404,
      message: 'Not found order'
    })
  }


  await StoreLatLong.findOneAndUpdate(
    { orderId: storeLatLongData.orderId },
    {
      $set: {
        status: status,
        statusTH: 'ยกเลิก',
        'approve.dateAction': new Date(),
        'approve.appPerson': user
      }
    },
  )


  await ApproveLogs.create({
    module: 'canceledOrderLatLongStore',
    user: user,
    status: status,
    id: orderId,
  })

  res.status(201).json({
    status: 201,
    message: 'Update status sucess'
  })

}


