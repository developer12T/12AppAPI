const mongoose = require('mongoose')

const { uploadFiles } = require('../../utilities/upload')
const { calculateSimilarity } = require('../../utilities/utility')
const axios = require('axios')
const multer = require('multer')
const userModel = require('../../models/cash/user')
const ExcelJS = require('exceljs')
const { getSocket } = require('../../socket')
const addUpload = multer({ storage: multer.memoryStorage() }).array(
  'storeImages'
)
const sql = require('mssql')
const {
  storeQuery,
  storeQueryFilter,
  groupStoreType
} = require('../../controllers/queryFromM3/querySctipt')
const getUploadMiddleware = channel => {
  const storage = multer.memoryStorage()
  let limits = {}

  if (channel == 'cash') {
    limits = {
      files: 3
    }
  } else if (channel == 'credit') {
    limits = {
      files: 6
    }
  }

  return multer({ storage, limits }).array('storeImages')
}

const orderModel = require('../../models/cash/sale')
const storeModel = require('../../models/cash/store')
const routeModel = require('../../models/cash/route')
const refundModel = require('../../models/cash/refund')

// const userModel = require('../../models/cash/user')
const DistributionModel = require('../../models/cash/distribution')
const promotionModel = require('../../models/cash/promotion')
const { getModelsByChannel } = require('../../middleware/channel')
const sharp = require('sharp')
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
      query.status = { $nin: ['10'] }
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

exports.addStore = async (req, res) => {
  const channel = req.headers['x-channel'] // 'credit' or 'cash'

  const { Store } = getModelsByChannel(channel, res, storeModel)

  const upload = getUploadMiddleware(channel)

  upload(req, res, async err => {
    if (err) {
      return res.status(400).json({ status: '400', message: err.message })
    }
    try {
      if (!req.body.store) {
        return res.status(400).json({
          status: '400',
          message: 'Store data is required'
        })
      }

      const files = req.files
      const store = JSON.parse(req.body.store)
      const types = req.body.types ? req.body.types.split(',') : []

      if (!store.name || !store.address) {
        return res.status(400).json({
          status: '400',
          message: 'Required fields are missing: name, address'
        })
      }

      if (files.length !== types.length) {
        return res.status(400).json({
          status: '400',
          message: 'Number of files and types do not match'
        })
      }

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

      const policyAgree = {
        status: store.policyConsent?.status || ''
      }
      const approve = {
        status: '19'
      }

      const shippingAddress = Array.isArray(store.shippingAddress)
        ? store.shippingAddress
        : []
      const shipping = shippingAddress.map(ship => ({
        default: ship.default || '',
        address: ship.address || '',
        district: ship.district || '',
        subDistrict: ship.subDistrict || '',
        province: ship.provinceCode || '',
        postCode: ship.postCode || '',
        latitude: ship.latitude || '',
        longtitude: ship.longtitude || ''
      }))

      const checkIn = {}

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
        approve: approve,
        policyConsent: policyAgree,
        imageList: imageList,
        shippingAddress: shipping,
        checkIn: checkIn
      })

      await storeData.save()
      // console.log(storeData)

      const io = getSocket()
      io.emit('store/addStore', {})

      res.status(200).json({
        status: '200',
        message: 'Store added successfully'
        // data:storeData
      })
    } catch (error) {
      console.error('Error saving store to MongoDB:', error)
      res.status(500).json({ status: '500', message: 'Server Error' })
    }
  })
}

exports.checkSimilarStores = async (req, res) => {
  const { storeId } = req.params
  const channel = req.headers['x-channel']
  const { Store } = getModelsByChannel(channel, res, storeModel)
  const store = await Store.findOne({ storeId })

  const existingStores = await Store.find(
    { storeId: { $ne: storeId } },
    { _id: 0, __v: 0, idIndex: 0 },
    // { area: store.area }
  )

  // 1. กำหนด weight ของแต่ละ field (ค่า sum ต้องไม่จำเป็นต้องรวมกันเท่ากับ 100)
  const fieldsToCheck = [
    { field: 'name', weight: 2 },
    { field: 'taxId', weight: 4 },
    { field: 'tel', weight: 3 },
    { field: 'address', weight: 2 },
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
    io.emit('store/editStore', {})

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

    const result = await storeQuery(channel) // ข้อมูลจาก ERP
    // console.log(result)
    const storeMap = new Map(result.map(item => [item.storeId, item]))

    const mongoStores = await Store.find()
    const changes = {
      added: [],
      updated: [],
      deleted: []
    }

    for (const item of result) {
      const existing = await Store.findOne({ storeId: item.storeId })

      if (!existing) {
        await Store.create(item)
        changes.added.push(item.storeId)
      } else {
        // อัปเดตถ้ามีการเปลี่ยนแปลงจริง
        let isModified = false
        const fields = Object.keys(item)

        for (const field of fields) {
          if (existing[field] !== item[field]) {
            existing[field] = item[field]
            isModified = true
          }
        }

        if (isModified) {
          await existing.save()
          changes.updated.push(item.storeId)
        }
      }
    }

    // ลบ store ที่ไม่มีใน ERP (optional)
    for (const store of mongoStores) {
      if (!storeMap.has(store.storeId)) {
        await Store.deleteOne({ _id: store._id })
        changes.deleted.push(store.storeId)
      }
    }

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
    io.emit('store/checkIn', {})

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

  exports.updateStoreStatus = async (req, res) => {
    const { storeId, status, user } = req.body
    const channel = req.headers['x-channel']
    const { RunningNumber, Store } = getModelsByChannel(channel, res, storeModel)
    const { User } = getModelsByChannel(channel, res, userModel)
    const store = await Store.findOne({ storeId: storeId })
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
    // console.log(oldId,"oldId")
    const newId = oldId.last.replace(/\d+$/, n =>
      String(+n + 1).padStart(n.length, '0')
    )

    // console.log(newId,"newId")

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
      const dataUser = await User.findOne({ area: store.area, role: 'sale' })


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

        const io = getSocket()
        io.emit('store/updateStoreStatus', {})

        return res.status(500).json({
          message: 'Internal Server Error',
          error: error.message
        })
      }

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

  console.log(response.data)
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
    running = 'CV'
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
      start: `${running}${u._id}2500000`,
      last: `${running}${u._id}2500000`
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

    // 1. ลบข้อมูลเดิมทั้งหมด
    await TypeStore.deleteMany({})

    // 2. เพิ่มข้อมูลใหม่
    await TypeStore.insertMany(
      bueatydata.map(x => ({ ...x, type: ['beauty'] }))
    )

    // 3. ส่ง socket event
    const io = getSocket()
    io.emit('store/addBueatyStore', {})

    // 4. ตอบกลับ
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
  io.emit('store/deleteStoreArray', {})

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
    io.emit('store/addShippingInStore', {})

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
    io.emit('store/editShippingInStore', {})

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
    const { storeId, shippingId } = req.body // หรือ req.params, แล้วแต่ดีไซน์

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
    io.emit('store/deleteShippingFromStore', {})

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


