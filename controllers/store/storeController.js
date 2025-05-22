const { uploadFiles } = require('../../utilities/upload')
const { calculateSimilarity } = require('../../utilities/utility')
const axios = require('axios')
const multer = require('multer')
const upload = multer({ storage: multer.memoryStorage() }).array(
  'storeImages',
  3
)
const storeModel = require('../../models/cash/store')
const { getModelsByChannel } = require('../../middleware/channel')
const path = require('path')
const { v4: uuidv4 } = require('uuid')
uuidv4() // ⇨ '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'

exports.getStore = async (req, res) => {
  try {
    const { area, type, route } = req.query
    const channel = req.headers['x-channel'] // 'credit' or 'cash'

    const { Store } = getModelsByChannel(channel, res, storeModel)

    const currentDate = new Date()
    const startMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    )
    const NextMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      1
    )

    let query = { area }

    if (type === 'new') {
      query.createdAt = {
        $gte: startMonth,
        $lt: NextMonth
      }
      // query.status = '10'
    } else if (type === 'all') {
      // query.createdAt = {
      //   $not: {
      //     $gte: startMonth,
      //     $lt: NextMonth
      //   }
      // }
    }

    if (route) {
      query.route = route
    }
    const data = await Store.aggregate([
  { $match: query },
  {
    $lookup: {
      from: 'typestore',
      localField: 'storeId',
      foreignField: 'storeId',
      as: 'beauty'
    }
  },
{
  $addFields: {
    storetype: {
      $reduce: {
        input: "$beauty",
        initialValue: [],
        in: {
          $concatArrays: ["$$value", "$$this.type"]
        }
      }
    }
  }
},
  {
    $project: {
      _id: 0,
      __v: 0,
      beauty:0
    }
  }
]);

    // console.log(data)

    if (data.length === 0) {
      return res.status(404).json({
        status: 404,
        message: 'Not Found Store'
      })
    }

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
  upload(req, res, async err => {
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

      const channel = req.headers['x-channel'] // 'credit' or 'cash'

      const { Store } = getModelsByChannel(channel, res, storeModel)

      const store = await Store.findOne({ storeId: storeId })

      if (!store) {
        return res
          .status(404)
          .json({ status: '404', message: 'Store not found' })
      }

      const uploadedFiles = []
      for (let i = 0; i < files.length; i++) {
        const uploadedFile = await uploadFiles(
          [files[i]],
          path.join(__dirname, '../../public/images/stores'),
          store.area,
          types[i]
        )
        uploadedFiles.push({
          name: uploadedFile[0].name,
          path: uploadedFile[0].fullPath,
          type: types[i]
        })
      }

      const imageList = uploadedFiles

      await Store.updateOne(
        { storeId: storeId },
        { $set: { imageList: imageList } }
      )

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
      const channel = req.headers['x-channel'] // 'credit' or 'cash'

      const { Store } = getModelsByChannel(channel, res, storeModel)
      const existingStores = await Store.find(
        {},
        { _id: 0, __v: 0, idIndex: 0 }
      )
      const fieldsToCheck = [
        'name',
        'taxId',
        'tel',
        'address',
        // 'district',
        // 'subDistrict',
        // 'province',
        // 'postCode',
        'latitude',
        'longtitude'
      ]

      const similarStores = existingStores
        .map(existingStore => {
          let totalSimilarity = 0
          fieldsToCheck.forEach(field => {
            const similarity = calculateSimilarity(
              store[field]?.toString() || '',
              existingStore[field]?.toString() || ''
            )
            totalSimilarity += similarity
          })

          const averageSimilarity = totalSimilarity / fieldsToCheck.length
          return {
            store: existingStore,
            similarity: averageSimilarity
          }
        })
        .filter(result => result.similarity > 70)
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
        return res.status(200).json({
          status: '200',
          message: 'similar store',
          data: sanitizedStores
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
        uploadedFiles.push({
          name: uploadedFile[0].name,
          path: uploadedFile[0].fullPath,
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
        provinceCode: ship.provinceCode || '',
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
        createdDate: splitData.createdDate,
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
  const { storeId, area } = req.body

  const areaPrefix = area.substring(0, 2)
  const channel = req.headers['x-channel']

  const { Store } = getModelsByChannel(channel, res, storeModel)
  const latestStore = await Store.findOne({
    storeId: { $regex: `^V${areaPrefix}`, $options: 'i' }
  })
    .sort({ storeId: -1 })
    .select('storeId')

  if (latestStore === null) {
    return res.status(404).json({
      status: 404,
      message: `Not Found This area:${area}`
    })
  }
  const maxLength = 7 // กำหนดให้ไม่เกิน 7 หลัก

  const newStoreId = latestStore.storeId.replace(/\d+$/, num => {
    // เพิ่ม 1 ที่เลขท้าย
    const newNum = (Number(num) + 1).toString()

    // ถ้าหมายเลขมากกว่า maxLength ให้ตัดให้เป็น 7 หลัก
    return newNum.length > maxLength
      ? newNum.slice(0, maxLength)
      : newNum.padStart(num.length, '0')
  })

  const result = await Store.updateOne(
    { storeId: storeId },
    { $set: { storeId: newStoreId, status: '20', updatedDate: Date() } }
  )

  // console.log(newStoreId)

  res.status(200).json({
    status: 200,
    message: 'Update Success'
  })
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
      createdDate: splitData.createdDate,
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
        zone: { $ne: null, $ne: '' }
      }
    },
    {
      $group: {
        _id: '$zone'
      }
    }
  ])

  const maxRunningAll = await Store.aggregate([
    {
      $match: {
        zone: { $ne: null, $ne: '' }
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

  const newStore = await Store.findOneAndUpdate(
    { storeId: storeId },
    { $set: { storeId: newId } },
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
  let pathPhp = ''

  switch (channel) {
    case 'cash':
      pathPhp = 'ca_api/ca_customer_beauty.php'
      break
    case 'credit':
      pathPhp = 'cr_api/cr_customer_beauty.php'
      break
    default:
      break
  }
  const response = await axios.post(
    `http://58.181.206.159:9814/apps_api/${pathPhp}`
  )

  const { TypeStore } = getModelsByChannel(channel, res, storeModel)

  for (const data of response.data) {
    const exists = await TypeStore.findOne({ storeId: data.storeId })
    if (!exists) {
      await TypeStore.create({ ...data, type: ['beauty'] })
    }
  }

  res.status(200).json({
    status: 200,
    message: response.data
  })
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


