// const { query } = require('express')
const axios = require('axios')
const { Route, RouteChangeLog } = require('../../models/cash/route')
const { period, previousPeriod } = require('../../utilities/datetime')
const { Store } = require('../../models/cash/store')
const { uploadFilesCheckin } = require('../../utilities/upload')
const multer = require('multer')
const upload = multer({ storage: multer.memoryStorage() }).array(
  'checkInImage',
  1
)
const { to2 } = require('../../middleware/order')
const mongoose = require('mongoose')
const xlsx = require('xlsx')
const sql = require('mssql')
const {
  routeQuery,
  routeQueryOne
} = require('../../controllers/queryFromM3/querySctipt')
const orderModel = require('../../models/cash/sale')
const routeModel = require('../../models/cash/route')
const radiusModel = require('../../models/cash/radius')
const storeModel = require('../../models/cash/store')
const productModel = require('../../models/cash/product')
const { getSocket } = require('../../socket')
const { getModelsByChannel } = require('../../middleware/channel')
const path = require('path')
const { group } = require('console')
const { formatDateTimeToThai } = require('../../middleware/order')
const fs = require('fs')
const os = require('os')



exports.getRoute = async (req, res) => {
  try {
    const { period, area, district, province, routeId, storeId } = req.query
    const channel = req.headers['x-channel']

    const { Store, TypeStore } = getModelsByChannel(channel, res, storeModel)
    const { Route } = getModelsByChannel(channel, res, routeModel)

    if (!period) {
      return res
        .status(400)
        .json({ status: 400, message: 'period is required' })
    }

    const query = { period }
    if (area) query.area = area
    if (routeId) query.id = routeId

    const routes = await Route.find(query).populate(
      'listStore.storeInfo',
      'storeId name address typeName taxId tel'
    )

    // console.log(routes)

    const filteredRoutes = routes
      .map(route => {
        const filteredListStore = route.listStore.filter(store => {
          const addr = (store.storeInfo?.address || '').toLowerCase()

          const matchDistrict = district
            ? addr.includes(district.toLowerCase())
            : true

          const matchProvince = province
            ? addr.includes(province.toLowerCase())
            : true

          const matchStoreId = storeId
            ? store.storeInfo?.storeId === storeId
            : true

          return matchDistrict && matchProvince && matchStoreId
        })
        // console.log(route)
        return {
          ...route.toObject(),
          listStore: filteredListStore
        }
      })
      .filter(route => route.listStore.length > 0)

    // console.log(filteredRoutes)

    const allStoreIds = filteredRoutes.flatMap(route =>
      route.listStore.map(s => s.storeInfo?.storeId).filter(Boolean)
    )

    const storeTypes = await TypeStore.find({
      storeId: { $in: allStoreIds }
    }).select('storeId type')

    const storeTypeMap = new Map(storeTypes.map(s => [s.storeId, s.type]))

    enrichedRoutes = filteredRoutes.map(route => {
      const enrichedListStore = route.listStore.map(itemRaw => {
        const item = itemRaw.toObject ? itemRaw.toObject() : itemRaw

        // console.log(item)

        const storeInfo = item.storeInfo?.toObject
          ? item.storeInfo.toObject()
          : item.storeInfo || {}

        const type = storeTypeMap.get(storeInfo.storeId)
        // console.log(item)
        return {
          ...item,
          storeInfo,
          storeType: type || []
        }
      })

      return {
        ...route,
        listStore: enrichedListStore
      }
    })

    // console.log(enrichedRoutes)

    if (area && period && !routeId && !storeId && !province) {
      enrichedRoutes = (enrichedRoutes || []).map(item => ({
        ...item,
        listStore: []
      }))
    }

    // enrichedRoutes = (enrichedRoutes || []).map(item => ({
    //   ...item,
    //   listStore: []
    // }))

    // }
    // const io = getSocket()
    // io.emit('route/getRoute', {});

    res.status(200).json({
      status: 200,
      message: 'Success',
      data: enrichedRoutes
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ status: 500, message: err.message })
  }
}

exports.addFromERP = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    let pathPhp = ''
    switch (channel) {
      case 'cash':
        pathPhp = 'ca_api/ca_route.php'
        break
      case 'credit':
        pathPhp = 'cr_api/cr_route.php'
        break
      default:
        break
    }
    const response = await axios.post(
      `http://58.181.206.159:9814/apps_api/${pathPhp}`
    )
    if (!response.data || !Array.isArray(response.data)) {
      return res.status(400).json({
        status: '400',
        message: 'Invalid response data from external API'
      })
    }

    const { Store } = getModelsByChannel(channel, res, storeModel)
    const { Route } = getModelsByChannel(channel, res, routeModel)
    const route = await Route.find({ period: period() })

    const routeMap = new Map(route.map(route => [route.id, route]))
    let routeId
    const latestRoute = route.sort((a, b) => b.id.localeCompare(a.id))[0]
    if (!latestRoute) {
      routeId = `${period()}${response.data.area}R01`
      // console.log('route', routeId)
      // console.log('period', period())
    } else {
      const prefix = latestRoute.id.slice(0, 6)
      const subfix = (parseInt(latestRoute.id.slice(7)) + 1)
        .toString()
        .padStart(2, '0')
      routeId = prefix + subfix
    }

    for (const storeList of response.data) {
      try {
        const existingRoute = routeMap.get(storeList.id)

        if (existingRoute) {
          for (const list of storeList.storeInfo || []) {
            const store = await Store.findOne({ storeId: list })
            if (!store) {
              console.warn(`Store with storeId ${list} not found`)
              continue
            }

            const storeExists = existingRoute.listStore.some(
              store => store.storeInfo.toString() === store._id.toString()
            )
            if (!storeExists) {
              const newData = {
                storeInfo: store._id,
                note: '',
                image: '',
                latitude: '',
                longtitude: '',
                status: 0,
                statusText: 'รอเยี่ยม',
                listOrder: [],
                date: ''
              }
              existingRoute.listStore.push(newData)
            }
          }
          await existingRoute.save()
        } else {
          const listStore = []

          for (const storeId of storeList.listStore || []) {
            const idStore = storeId.storeInfo
            const store = await Store.findOne({ storeId: idStore })
            if (store) {
              listStore.push({
                storeInfo: store._id,
                latitude: '',
                longtitude: '',
                status: 0,
                statusText: 'รอเยี่ยม',
                note: '',
                date: '',
                listOrder: []
              })
            } else {
              console.warn(`Store with storeId ${storeId} not found`)
            }
          }

          const data = {
            id: storeList.id,
            area: storeList.area,
            period: period(),
            day: storeList.day,
            listStore
          }
          await Route.create(data)
        }
      } catch (err) {
        console.error(
          `Error processing storeList with id ${storeList.id}:`,
          err.message
        )
        continue
      }
    }

    res.status(200).json({
      status: '200',
      message: 'Add Route Successfully'
    })
  } catch (e) {
    console.error('Error in addFromERP:', e.message)
    res.status(500).json({
      status: '500',
      message: e.message
    })
  }
}

exports.addFromERPnew = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { period } = req.body
    const result = await routeQuery(channel)


    const return_arr = []

    for (const row of result) {
      const area = String(row.area ?? '').trim()
      const id = String(row.id ?? '').trim()
      const day = String(row.day ?? '').trim()
      const storeId = String(row.storeId ?? '').trim()

      const storeInfo = {
        storeInfo: storeId,
        latitude: '',
        longtitude: '',
        note: '',
        status: '0',
        statusText: '',
        date: '',
        listOrder: []
      }

      let groupFound = false

      for (const group of return_arr) {
        if (group.id === id && group.area === area) {
          group.listStore.push(storeInfo)
          groupFound = true
          break
        }
      }

      if (!groupFound) {
        return_arr.push({
          id,
          area,
          period,
          day,
          listStore: [storeInfo]
        })
      }
    }

    const { Store } = getModelsByChannel(channel, res, storeModel)
    const { Route } = getModelsByChannel(channel, res, routeModel)
    const route = await Route.find({ period: period })
    const routeMap = new Map(route.map(route => [route.id, route]))
    let routeId
    const latestRoute = route.sort((a, b) => b.id.localeCompare(a.id))[0]
    if (!latestRoute) {
      routeId = `${period}${return_arr.area}R01`

    } else {
      const prefix = latestRoute.id.slice(0, 6)
      const subfix = (parseInt(latestRoute.id.slice(7)) + 1)
        .toString()
        .padStart(2, '0')
      routeId = prefix + subfix
    }

    for (const storeList of return_arr) {
      try {
        const existingRoute = routeMap.get(storeList.id)

        if (existingRoute) {
          for (const list of storeList.storeInfo || []) {
            const store = await Store.findOne({ storeId: list })
            if (!store) {
              // console.warn(`Store with storeId ${list} not found`)
              continue
            }

            const storeExists = existingRoute.listStore.some(
              store => store.storeInfo.toString() === store._id.toString()
            )
            if (!storeExists) {
              const newData = {
                storeInfo: store._id,
                note: '',
                image: '',
                latitude: '',
                longtitude: '',
                status: 0,
                statusText: 'รอเยี่ยม',
                listOrder: [],
                date: ''
              }
              existingRoute.listStore.push(newData)
            }
          }
          await existingRoute.save()
        } else {
          const listStore = []

          for (const storeId of storeList.listStore || []) {
            const idStore = storeId.storeInfo
            const store = await Store.findOne({ storeId: idStore })
            if (store) {
              listStore.push({
                storeInfo: store._id,
                latitude: '',
                longtitude: '',
                status: 0,
                statusText: 'รอเยี่ยม',
                note: '',
                date: '',
                listOrder: []
              })
            } else {
              // console.warn(`Store with storeId ${storeId} not found`)
            }
          }

          const data = {
            id: storeList.id,
            area: storeList.area,
            period: period,
            day: storeList.day,
            listStore
          }
          await Route.create(data)
        }
      } catch (err) {
        console.error(
          `Error processing storeList with id ${storeList.id}:`,
          err.message
        )
        continue
      }
    }

    const io = getSocket()
    io.emit('route/addFromERPnew', {})

    res.status(200).json({
      status: 200,
      message: 'sucess'
      // data: return_arr
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.addFromERPOne = async (req, res) => {
  try {
    const { id } = req.body
    const channel = req.headers['x-channel']
    const { Route } = getModelsByChannel(channel, res, routeModel)
    const { Store } = getModelsByChannel(channel, res, storeModel)

    const result = await routeQueryOne(channel, id)
    // console.log(result)
    await Route.deleteOne({ id: id })
    const return_arr = []
    for (const row of result) {
      const area = String(row.area ?? '').trim()
      const id = String(row.id ?? '').trim()
      const day = String(row.day ?? '').trim()
      const period = String(row.period ?? '').trim()
      const storeId = String(row.storeId ?? '').trim()

      const storeInfo = {
        storeInfo: storeId,
        latitude: '',
        longtitude: '',
        note: '',
        status: '0',
        statusText: '',
        date: '',
        listOrder: []
      }

      let groupFound = false

      for (const group of return_arr) {
        if (group.id === id && group.area === area) {
          group.listStore.push(storeInfo)
          groupFound = true
          break
        }
      }

      if (!groupFound) {
        return_arr.push({
          id,
          area,
          period,
          day,
          listStore: [storeInfo]
        })
      }
    }

    const route = await Route.find({ period: period(), id: id })
    const routeMap = new Map(route.map(route => [route.id, route]))
    // console.log(route)
    // let routeId
    // const latestRoute = route.sort((a, b) => b.id.localeCompare(a.id))[0]
    // if (!latestRoute) {
    //   routeId = `${period()}${return_arr.area}R01`
    //   console.log('route', routeId)
    //   console.log('period', period())
    // } else {
    //   const prefix = latestRoute.id.slice(0, 6)
    //   const subfix = (parseInt(latestRoute.id.slice(7)) + 1)
    //     .toString()
    //     .padStart(2, '0')
    //   routeId = prefix + subfix
    // }

    for (const storeList of return_arr) {
      try {
        const existingRoute = routeMap.get(storeList.id)

        if (existingRoute) {
          for (const list of storeList.storeInfo || []) {
            const store = await Store.findOne({ storeId: list })
            if (!store) {
              // console.warn(`Store with storeId ${list} not found`)
              continue
            }

            const storeExists = existingRoute.listStore.some(
              store => store.storeInfo.toString() === store._id.toString()
            )
            if (!storeExists) {
              const newData = {
                storeInfo: store._id,
                note: '',
                image: '',
                latitude: '',
                longtitude: '',
                status: 0,
                statusText: 'รอเยี่ยม',
                listOrder: [],
                date: ''
              }
              existingRoute.listStore.push(newData)
            }
          }
          await existingRoute.save()
        } else {
          const listStore = []

          for (const storeId of storeList.listStore || []) {
            const idStore = storeId.storeInfo
            const store = await Store.findOne({ storeId: idStore })
            if (store) {
              listStore.push({
                storeInfo: store._id,
                latitude: '',
                longtitude: '',
                status: 0,
                statusText: 'รอเยี่ยม',
                note: '',
                date: '',
                listOrder: []
              })
            } else {
              // console.warn(`Store with storeId ${storeId} not found`)
            }
          }

          const data = {
            id: storeList.id,
            area: storeList.area,
            period: period(),
            day: storeList.day,
            listStore
          }
          // console.log(data)
          await Route.create(data)
        }
      } catch (err) {
        console.error(
          `Error processing storeList with id ${storeList.id}:`,
          err.message
        )
        continue
      }
    }

    const io = getSocket()
    io.emit('route/addFromERPOne', {})

    res.status(200).json({
      status: 200,
      message: 'sucess',
      data: return_arr
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.checkIn = async (req, res) => {
  upload(req, res, async err => {
    if (err) {
      return res.status(400).json({ status: '400', message: err.message })
    }
    try {
      const { routeId, storeId, note, latitude, longtitude } = req.body
      const channel = req.headers['x-channel']

      const { Store } = getModelsByChannel(channel, res, storeModel)

      const { Route } = getModelsByChannel(channel, res, routeModel)
      if (!routeId || !storeId) {
        return res.status(400).json({
          status: '400',
          message: 'routeId and storeId are required'
        })
      }

      const store = await Store.findOne({ storeId })
      if (!store) {
        return res
          .status(404)
          .json({ status: '404', message: 'Store not found' })
      }

      const period = routeId.substring(0, 6)
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)

      const endOfDay = new Date()
      endOfDay.setHours(23, 59, 59, 999)

      let allRoute = await Route.aggregate([
        {
          $match: {
            period: period
          }
        },
        { $unwind: '$listStore' },
        {
          $project: {
            listStore: 1
          }
        },
        {
          $replaceRoot: { newRoot: '$listStore' }
        },
        {
          $match: {
            status: { $nin: ['0'] },
            storeInfo: store._id.toString(),
            date: { $gte: startOfDay, $lte: endOfDay }
          }
        }
      ])
      // console.log(allRoute.length)

      if (allRoute.length > 0) {
        return res.status(409).json({
          status: 409,
          message: 'Duplicate Store on this day'
        })
      }

      let image = null
      if (req.files) {
        try {
          const files = req.files
          const uploadedFile = await uploadFilesCheckin(
            files,
            path.join(__dirname, '../../public/images/stores/checkin'),
            store.area,
            storeId
          )

          if (uploadedFile.length > 0) {
            image = uploadedFile[0].path
          }
        } catch (fileError) {
          return res.status(500).json({
            status: '500',
            message: `File upload error: ${fileError.message}`
          })
        }
      }

      const routeUpdate = await Route.findOneAndUpdate(
        { id: routeId, 'listStore.storeInfo': store._id },
        {
          $set: {
            'listStore.$.note': note,
            'listStore.$.image': image,
            'listStore.$.latitude': latitude,
            'listStore.$.longtitude': longtitude,
            'listStore.$.status': '2',
            'listStore.$.statusText': 'ไม่ซื้อ',
            'listStore.$.date': new Date()
          }
        },
        { new: true }
      )

      if (!routeUpdate) {
        return res.status(404).json({
          status: '404',
          message: 'Route not found or listStore not matched'
        })
      }

      const io = getSocket()
      io.emit('route/checkIn', {
        status: '200',
        message: 'check in successfully'
      })

      res.status(200).json({
        status: '200',
        message: 'check in successfully'
      })
    } catch (error) {
      console.error('Error saving data to MongoDB:', error)
      res.status(500).json({ status: '500', message: 'Server Error' })
    }
  })
}

exports.checkInVisit = async (req, res) => {
  const channel = req.headers['x-channel']
  const { Store } = getModelsByChannel(channel, res, storeModel)
  const { Route } = getModelsByChannel(channel, res, routeModel)

  upload(req, res, async err => {
    if (err) {
      return res.status(400).json({ status: '400', message: err.message })
    }
    try {
      const { routeId, storeId, note, latitude, longtitude } = req.body

      if (!routeId || !storeId) {
        return res.status(400).json({
          status: '400',
          message: 'routeId and storeId are required'
        })
      }

      const store = await Store.findOne({ storeId })
      if (!store) {
        return res
          .status(404)
          .json({ status: '404', message: 'Store not found' })
      }

      const period = routeId.substring(0, 6)
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)

      const endOfDay = new Date()
      endOfDay.setHours(23, 59, 59, 999)

      let allRoute = await Route.aggregate([
        {
          $match: {
            period: period
          }
        },
        { $unwind: '$listStore' },
        {
          $project: {
            listStore: 1
          }
        },
        {
          $replaceRoot: { newRoot: '$listStore' }
        },
        {
          $match: {
            status: { $nin: ['0'] },
            storeInfo: store._id.toString(),
            date: { $gte: startOfDay, $lte: endOfDay }
          }
        }
      ])
      // console.log(allRoute.length)

      if (allRoute.length > 0) {
        return res.status(409).json({
          status: 409,
          message: 'Duplicate Store on this day'
        })
      }

      let image = null
      if (req.files) {
        try {
          const files = req.files
          const uploadedFile = await uploadFilesCheckin(
            files,
            path.join(__dirname, '../../public/images/stores/checkin'),
            store.area,
            storeId
          )

          if (uploadedFile.length > 0) {
            image = uploadedFile[0].path
          }
        } catch (fileError) {
          return res.status(500).json({
            status: '500',
            message: `File upload error: ${fileError.message}`
          })
        }
      }

      const route = await Route.findOneAndUpdate(
        { id: routeId, 'listStore.storeInfo': store._id },
        {
          $set: {
            'listStore.$.note': note,
            'listStore.$.image': image,
            'listStore.$.latitude': latitude,
            'listStore.$.longtitude': longtitude,
            'listStore.$.status': '1',
            'listStore.$.statusText': 'เยี่ยมแล้ว',
            'listStore.$.date': new Date()
          }
        },
        { new: true }
      )

      if (!route) {
        return res.status(404).json({
          status: '404',
          message: 'Route not found or listStore not matched'
        })
      }

      const io = getSocket()
      io.emit('route/checkInVisit', {
        status: '200',
        message: 'check in successfully'
      })

      res.status(200).json({
        status: '200',
        message: 'check in successfully'
      })
    } catch (error) {
      console.error('Error saving data to MongoDB:', error)
      res.status(500).json({ status: '500', message: 'Server Error' })
    }
  })
}

exports.changeRoute = async (req, res) => {
  try {
    const { area, period, type, changedBy, fromRoute, toRoute, listStore } =
      req.body
    const channel = req.headers['x-channel']

    const { Store } = getModelsByChannel(channel, res, storeModel)
    const { RouteChangeLog } = getModelsByChannel(channel, res, routeModel)
    if (
      !area ||
      !period ||
      !type ||
      !changedBy ||
      !fromRoute ||
      !toRoute ||
      !listStore ||
      !listStore.length
    ) {
      return res
        .status(400)
        .json({ status: '400', message: 'Missing required fields!' })
    }

    const stores = await Store.find({ storeId: { $in: listStore } }).select(
      '_id'
    )

    if (stores.length !== listStore.length) {
      return res
        .status(404)
        .json({ status: '404', message: 'Some store IDs not found!' })
    }

    const listStoreMapped = stores.map(store => ({
      storeInfo: store._id.toString()
    }))

    const newRouteChangeLog = new RouteChangeLog({
      area,
      period,
      type,
      changedBy,
      fromRoute,
      toRoute,
      changedDate: new Date(),
      listStore: listStoreMapped,
      status: '0'
    })

    await newRouteChangeLog.save()

    const io = getSocket()
    io.emit('route/change', {
      status: 201,
      message: 'Route change logged successfully!'
    })

    res.status(201).json({
      status: 201,
      message: 'Route change logged successfully!'
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: 'Internal server error.' })
  }
}

exports.createRoute = async (req, res) => {
  try {
    const { period, area } = req.body

    const channel = req.headers['x-channel']

    const { Route } = getModelsByChannel(channel, res, routeModel)
    const { RouteChangeLog } = getModelsByChannel(channel, res, routeModel)

    if (!period || !area || area.length === 0) {
      return res.status(400).json({ message: 'Period and area are required.' })
    }

    const newRoutes = []
    const prevPeriod = previousPeriod(period)

    for (const currentArea of area) {
      const changeLogs = await RouteChangeLog.find({
        area: currentArea,
        period,
        status: '0'
      }).lean()

      const previousRoutes = await Route.find({
        period: prevPeriod,
        area: currentArea
      }).lean()

      const changedStoreMap = {}
      changeLogs.forEach(log => {
        log.listStore.forEach(store => {
          changedStoreMap[store.storeInfo] = log
        })
      })
      // console.log('12', JSON.stringify(changeLogs, null, 2))

      const routesGroupedByToRoute = previousRoutes.reduce((grouped, route) => {
        const routeId = `${period}${currentArea}${route.id.slice(-3)}`
        if (!grouped[routeId]) {
          grouped[routeId] = {
            id: routeId,
            period,
            area: currentArea,
            day: route.id.slice(-2),
            listStore: []
          }
        }

        grouped[routeId].listStore.push(
          ...route.listStore
            .filter(store => !changedStoreMap[store.storeInfo])
            .map(store => ({
              storeInfo: store.storeInfo,
              statusText: 'รอเยี่ยม'
            }))
        )

        return grouped
      }, {})

      for (const log of changeLogs) {
        const { fromRoute, toRoute, type } = log

        for (const store of log.listStore) {
          const storeId = store.storeInfo

          if (type === 'add') {
            const fromRouteId = `${period}${currentArea}${fromRoute}`
            if (!routesGroupedByToRoute[fromRouteId]) {
              routesGroupedByToRoute[fromRouteId] = {
                id: fromRouteId,
                period,
                area: currentArea,
                day: fromRouteId.slice(-2),
                listStore: []
              }
            }
            routesGroupedByToRoute[fromRouteId].listStore.push({
              storeInfo: storeId
            })
          }

          const toRouteId = `${period}${currentArea}${toRoute}`
          if (!routesGroupedByToRoute[toRouteId]) {
            routesGroupedByToRoute[toRouteId] = {
              id: toRouteId,
              period,
              area: currentArea,
              day: toRouteId.slice(-2),
              listStore: []
            }
          }
          routesGroupedByToRoute[toRouteId].listStore.push({
            storeInfo: storeId
          })
        }
      }

      for (const [routeId, routeData] of Object.entries(
        routesGroupedByToRoute
      )) {
        const newRoute = new Route({
          id: routeId,
          period: routeData.period,
          area: routeData.area,
          day: routeId.slice(-2),
          listStore: routeData.listStore
        })
        // console.log(newRoute)
        await newRoute.save()
        newRoutes.push(newRoute)
      }

      await RouteChangeLog.updateMany(
        { area: currentArea, period, status: '0' },
        { $set: { status: '1' } }
      )
    }

    const io = getSocket()
    io.emit('route/createRoute', {
      status: '200',
      message: 'Routes created successfully.',
      data: newRoutes
    })

    res.status(200).json({
      status: '200',
      message: 'Routes created successfully.',
      data: newRoutes
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Internal server error' })
  }
}

exports.routeHistory = async (req, res) => {
  try {
    const { area, period, route, storeId } = req.query

    const channel = req.headers['x-channel']

    const { Store } = getModelsByChannel(channel, res, storeModel)
    const { RouteChangeLog } = getModelsByChannel(channel, res, routeModel)

    if (!area || !period) {
      return res.status(400).json({ message: 'Area and period are required.' })
    }

    const query = {
      area,
      period
    }

    if (storeId) {
      const store = await Store.findOne({ storeId })
      if (!store) {
        return res
          .status(404)
          .json({ message: `Store with storeId ${storeId} not found.` })
      }
      query.storeInfo = store._id
    }

    if (route && !storeId) {
      query.toRoute = route
    }

    const changeLogs = await RouteChangeLog.find(query)
      .populate('listStore.storeInfo', 'storeId name')
      .sort({ changedDate: -1 })

    if (!changeLogs.length) {
      return res
        .status(404)
        .json({ status: '404', message: 'History not found.' })
    }

    const io = getSocket()
    io.emit('route/history', {
      status: '200',
      message: 'Success',
      data: changeLogs
    })

    res.status(200).json({
      status: '200',
      message: 'Success',
      data: changeLogs
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Internal server error.' })
  }
}

// exports.getRouteCheckin = async (req, res) => {
//   try {
//   } catch (error) {}
// }

exports.getTimelineCheckin = async (req, res) => {
  try {
    const { area, period } = req.query

    const channel = req.headers['x-channel']

    const { Route } = getModelsByChannel(channel, res, routeModel)

    if (!area || !period) {
      return res
        .status(400)
        .json({ status: '400', message: 'params is required!' })
    }

    // const data = await Route.find(
    //   {
    //     listStore: { $elemMatch: { status: { $ne: '0' } } },
    //     area: { $regex: area },
    //     period: period
    //   },
    //   {
    //     listStore: { $elemMatch: { status: { $ne: '0' } } },
    //     area: 1,
    //     period: 1,
    //     id: 1
    //   },
    //   {
    //     'listStore.date': 1
    //   }
    // ).populate('listStore.storeInfo', 'storeId name address typeName taxId tel')

    const data = await Route.find(
      {
        listStore: { $elemMatch: { status: { $ne: '0' } } },
        area: { $regex: area, $options: 'i' }, // case-insensitive area search
        period: period
      },
      {
        listStore: 1,
        area: 1,
        period: 1,
        id: 1
      }
    ).populate('listStore.storeInfo', 'storeId name address typeName taxId tel')

    const result = data.map(item => {
      // Find the first store with status != '0'
      const storeItem = item.listStore.find(s => s.status !== '0')

      if (!storeItem) return null // skip if no valid store found

      const utcDate = new Date(storeItem.date)
      const bangkokDate = new Date(utcDate.getTime() + 7 * 60 * 60 * 1000)

      return {
        id: item.id,
        period: item.period,
        area: item.area,
        ay: item.day, // Directly access item.day
        storeId: storeItem.storeInfo.storeId,
        storeId: storeItem.storeInfo.name,
        note: storeItem.note,
        latitude: storeItem.latitude,
        longtitude: storeItem.longtitude,
        statusText: storeItem.statusText,
        date: bangkokDate
      }
    })
    // const result = data.map(item => {
    //   const utcDate = new Date(item.listStore[0].date)
    //   // Convert to Bangkok time (UTC+7)
    //   const bangkokDate = new Date(utcDate.getTime() + 7 * 60 * 60 * 1000)

    //   return {
    //     id: item.id,
    //     period: item.period,
    //     area: item.area,
    //     storeId: item.listStore.storeId,
    //     note: item.listStore[0].note,
    //     latitude: item.listStore[0].latitude,
    //     longtitude: item.listStore[0].longtitude,
    //     statusText: item.listStore[0].statusText,
    //     date: bangkokDate
    //   }
    // })

    if (!result) {
      res.status(404).json({
        status: 404,
        message: 'Not Found'
      })
    }

    // const io = getSocket()
    // io.emit('route/getTimelineCheckin', {});

    res.status(200).json({
      status: 200,
      message: 'Success',
      data: result
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Internal server error.' })
  }
}

exports.getRouteCheckinAll = async (req, res) => {
  try {
    const { area } = req.query

    const channel = req.headers['x-channel']

    const { Route } = getModelsByChannel(channel, res, routeModel)

    let query = [
      { $unwind: '$listStore' },
      {
        $group: {
          _id: { area: '$area', period: '$period', id: '$id' },
          count: {
            $sum: { $cond: [{ $ne: ['$listStore.status', '0'] }, 1, 0] }
          },
          sale: {
            $sum: { $cond: [{ $eq: ['$listStore.status', '1'] }, 1, 0] }
          },
          notSale: {
            $sum: { $cond: [{ $eq: ['$listStore.status', '2'] }, 1, 0] }
          },
          pending: {
            $sum: { $cond: [{ $eq: ['$listStore.status', '0'] }, 1, 0] }
          },
          all: { $sum: 1 }
        }
      },

      {
        $project: {
          count: 1,
          sale: 1,
          notSale: 1,
          pending: 1,
          all: 1,
          area: '$_id.area',
          period: '$_id.period',
          id: '$_id.id',
          _id: 0
        }
      },
      { $sort: { count: -1 } }
    ]
    if (area) {
      query = [
        { $unwind: '$listStore' },
        { $match: { area: { $eq: `${area}` } } },
        {
          $group: {
            _id: { area: '$area', period: '$period', id: '$id' },
            count: {
              $sum: { $cond: [{ $ne: ['$listStore.status', '0'] }, 1, 0] }
            },
            sale: {
              $sum: { $cond: [{ $eq: ['$listStore.status', '1'] }, 1, 0] }
            },
            notSale: {
              $sum: { $cond: [{ $eq: ['$listStore.status', '2'] }, 1, 0] }
            },
            pending: {
              $sum: { $cond: [{ $eq: ['$listStore.status', '0'] }, 1, 0] }
            },
            all: { $sum: 1 }
          }
        },

        {
          $project: {
            count: 1,
            sale: 1,
            notSale: 1,
            pending: 1,
            all: 1,
            area: '$_id.area',
            period: '$_id.period',
            id: '$_id.id',
            _id: 0
          }
        },
        { $sort: { count: -1 } }
      ]
    }

    const data = await Route.aggregate(query)

    // const io = getSocket()
    // io.emit('route/getRouteCheckinAll', {});

    res.status(200).json({
      status: 200,
      message: 'Success',
      data: data
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Internal server error.' })
  }
}

exports.routeTimeline = async (req, res) => {
  try {
    const { area, day, period } = req.body

    const channel = req.headers['x-channel']

    const { Route } = getModelsByChannel(channel, res, routeModel)

    const modelRoute = await Route.findOne({
      area: area,
      day: day,
      period: period
    })

    // console.log(modelRoute)

    if (modelRoute) {
      const tranFromRoue = modelRoute.listStore.map(route => {
        const date = new Date(route.date || '')
        // console.log(date)
        if (isNaN(date)) {
          return { date: '', hour: '' }
        }

        const bangkokDate = new Date(
          date.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
        )

        return {
          date: bangkokDate.toLocaleString('th-TH', {
            timeZone: 'Asia/Bangkok',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          }),
          hour: bangkokDate.getHours()
        }
      })

      const hourCountMap = {}

      // กรองข้อมูลเฉพาะเวลาที่อยู่ในช่วง 5 โมงเช้าถึง 6 โมงเย็น (05:00-17:59)
      tranFromRoue.forEach(item => {
        if (item.hour >= 5 && item.hour <= 18) {
          hourCountMap[item.hour] = (hourCountMap[item.hour] || 0) + 1
        }
      })

      // สร้างข้อมูลที่แสดงทุกชั่วโมงในช่วง 5-17 และกรอก count = 0 สำหรับชั่วโมงที่ไม่มีข้อมูล
      const data = []
      for (let hour = 5; hour <= 18; hour++) {
        data.push({
          time: String(hour).padStart(2, '0') + ':00',
          count: hourCountMap[hour] || 0
        })
      }

      // const io = getSocket()
      // io.emit('route/routeTimeline', {});

      res.status(200).json({
        response: data
      })
    } else {
      return res.status(404).json({
        message: `Not Found this ${area} day: ${day} `
      })
    }
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Internal server error.' })
  }
}

exports.updateAndAddRoute = async (req, res) => {
  try {
    const channel = req.headers['x-channel']

    const { Route } = getModelsByChannel(channel, res, routeModel)

    let pathPhp = ''
    switch (channel) {
      case 'cash':
        pathPhp = 'ca_api/ca_route.php'
        break
      case 'credit':
        pathPhp = 'cr_api/cr_route.php'
        break
      default:
        break
    }
    const response = await axios.post(
      `http://58.181.206.159:9814/apps_api/${pathPhp}`
    )
    if (!response.data || !Array.isArray(response.data)) {
      return res.status(400).json({
        status: '400',
        message: 'Invalid response data from external API'
      })
    }

    const { Store } = getModelsByChannel(channel, res, storeModel)
    const route = await Route.find({ period: period() })
    const routeMap = new Map(route.map(route => [route.id, route]))

    let routeId
    const latestRoute = route.sort((a, b) => b.id.localeCompare(a.id))[0]

    if (!latestRoute) {
      routeId = `${period()}${response.data.area}R01`
      // console.log('route', routeId)
      // console.log('period', period())
    } else {
      const prefix = latestRoute.id.slice(0, 6)
      const subfix = (parseInt(latestRoute.id.slice(7)) + 1)
        .toString()
        .padStart(2, '0')
      routeId = prefix + subfix
    }

    for (const storeList of response.data) {
      // try {
      const existingRoute = routeMap.get(storeList.id)
      // console.log(existingRoute)
      if (existingRoute) {
        for (const list of storeList.storeInfo || []) {
          const store = await Store.findOne({ storeId: list })
          // if (!store) {
          //   console.warn(`Store with storeId ${list} not found`)
          //   continue
          // }

          const storeExists = existingRoute.listStore.some(
            store => store.storeInfo.toString() === store._id.toString()
          )
          if (!storeExists) {
            const newData = {
              storeInfo: store._id,
              note: '',
              image: '',
              latitude: '',
              longtitude: '',
              status: 0,
              statusText: 'รอเยี่ยม',
              listOrder: [],
              date: ''
            }
            existingRoute.listStore.push(newData)
          }
        }

        await existingRoute.save()
        // console.log('existingRoute')
      } else {
        const listStore = []

        for (const storeId of storeList.listStore || []) {
          const idStore = storeId.storeInfo
          const store = await Store.findOne({ storeId: idStore })
          if (store) {
            // console.log(store)
            listStore.push({
              storeInfo: store._id,
              latitude: '',
              longtitude: '',
              status: 0,
              statusText: 'รอเยี่ยม',
              note: '',
              date: '',
              listOrder: []
            })
          }
          // else {
          //   console.warn(`Store with storeId ${storeId} not found`)
          // }
        }

        const data = {
          id: storeList.id,
          area: storeList.area,
          period: period(),
          day: storeList.day,
          listStore
        }
        await Route.create(data)
        // console.log("data",data)
      }
    }

    res.status(200).json({
      status: '200',
      message: 'Add Route Successfully'
    })
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }

}

exports.getRouteProvince = async (req, res) => {
  try {
    const { area, period } = req.body

    const channel = req.headers['x-channel']

    const { Route } = getModelsByChannel(channel, res, routeModel)

    const route = await Route.aggregate([
      {
        $match: {
          area: area,
          period: period,
          listStore: { $ne: null, $not: { $size: 0 } }
        }
      },
      { $unwind: { path: '$listStore', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          storeObjId: { $toObjectId: '$listStore.storeInfo' }
        }
      },
      {
        $lookup: {
          from: 'stores',
          localField: 'storeObjId',
          foreignField: '_id',
          as: 'storeDetail'
        }
      },
      {
        $project: {
          storeDetail: 1
        }
      },
      {
        $group: {
          _id: '$storeDetail.province'
        }
      },
      {
        $project: {
          _id: 0,
          province: '$_id'
        }
      }
    ])

    if (route.length == 0) {
      return res.status(404).json({
        status: 404,
        message: 'Not found province this area'
      })
    }

    const result = route
      .flatMap(item => item.province)
      .filter(p => p && p.trim() !== '')

    // const io = getSocket()
    // io.emit('route/getRouteProvince', {});

    res.status(200).json({
      status: 200,
      message: 'successful',
      data: result
    })
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }

}

exports.getRouteEffective = async (req, res) => {
  try {
    const { area, team, period, excel } = req.body
    const channel = req.headers['x-channel']

    const { Store, TypeStore } = getModelsByChannel(channel, res, storeModel)
    const { Route } = getModelsByChannel(channel, res, routeModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)
    const { Product } = getModelsByChannel(channel, res, productModel)


    let query = { period }

    // ✅ ถ้ามี area — ดึงเฉพาะ area นั้น
    // ❌ ถ้าไม่มี area — ดึงทุก area ยกเว้น IT211
    if (area) {
      query.area = area
    } else {
      query.area = { $ne: 'IT211' }
    }

    let routes = await Route.find({
      ...query,
      period,
      area: { $ne: 'IT211' } // ✅ exclude area 'IT211'
    }).populate('listStore.storeInfo', 'storeId name address typeName taxId tel')

    if (!routes.length) {
      return res.status(404).json({ status: 404, message: 'Not found route' })
    }

    // 🧩 สร้าง team code ถ้ามี
    if (team) {
      routes = routes
        .map(item => ({
          ...item.toObject(),
          team: item.area.substring(0, 2) + item.area.charAt(3),
        }))
        .filter(item => item.team === team)
    }

    // 🧩 ดึง order ทั้งหมดจากทุก route
    const orderIdList = routes.flatMap(r =>
      r.listStore.flatMap(s => s.listOrder?.map(o => o.orderId) || [])
    )
    const orderDetail = await Order.find({ orderId: { $in: orderIdList } })

    // ✅ ใช้ Map เพื่อ lookup order เร็วขึ้น
    const orderMap = new Map(orderDetail.map(o => [o.orderId, o]))

    // 🧩 เตรียม product factor (ใช้ aggregate แล้วแปลงเป็น map)
    const productIds = orderDetail.flatMap(o => o.listProduct.map(p => p.id))
    const productFactors = await Product.aggregate([
      { $match: { id: { $in: productIds } } },
      { $unwind: '$listUnit' },
      {
        $project: {
          _id: 0,
          id: '$id',
          unit: '$listUnit.unit',
          factor: '$listUnit.factor',
        },
      },
    ])

    // ✅ เก็บเป็น Map ของ Map เช่น factorMap.get(productId).get(unit)
    const factorMap = new Map()
    for (const f of productFactors) {
      if (!factorMap.has(f.id)) factorMap.set(f.id, new Map())
      factorMap.get(f.id).set(f.unit, f.factor)
    }

    // 🚀 คำนวณ summary / qty รวมเร็วขึ้น (ไม่ต้อง find ซ้ำ)
    const routesTranFrom = routes.map(r => {
      let totalSummary = 0
      let totalQtyCtnSum = 0

      for (const s of r.listStore) {
        for (const o of s.listOrder || []) {
          const order = orderMap.get(o.orderId)
          if (!order) continue

          totalSummary += order.total || 0

          for (const p of order.listProduct || []) {
            const factorUnit = factorMap.get(p.id)
            if (!factorUnit) continue

            const factorPcs = (p.qty || 0) * (factorUnit.get(p.unit) || 1)
            const factorCtn = factorUnit.get('CTN') || 1
            totalQtyCtnSum += Math.floor(factorPcs / factorCtn)
          }
        }
      }

      return {
        area: r.area,
        routeId: r.id,
        route: r.id.slice(-3),
        storeAll: r.storeAll,
        storePending: r.storePending,
        storeSell: r.storeSell,
        storeNotSell: r.storeNotSell,
        storeCheckInNotSell: r.storeCheckInNotSell,
        storeTotal: r.storeTotal,
        percentVisit: r.percentVisit,
        percentEffective: r.percentEffective,
        summary: totalSummary,
        totalqty: totalQtyCtnSum,
      }
    })

    // ❌ ตัด R25 / R26
    const excludedRoutes = ['R25', 'R26']
    const filteredRoutes = routesTranFrom.filter(r => !excludedRoutes.includes(r.route))

    // ✅ Group routes by area
    const groupedByArea = filteredRoutes.reduce((acc, cur) => {
      if (!acc[cur.area]) acc[cur.area] = []
      acc[cur.area].push(cur)
      return acc
    }, {})

    // ✅ สร้าง totalRoute สำหรับแต่ละ area
    const totalByArea = Object.keys(groupedByArea).map(areaKey => {
      const routesInArea = groupedByArea[areaKey]
      const totalRoute = routesInArea.reduce(
        (acc, cur) => {
          acc.storeAll += cur.storeAll
          acc.storePending += cur.storePending
          acc.storeSell += cur.storeSell
          acc.storeNotSell += cur.storeNotSell
          acc.storeCheckInNotSell += cur.storeCheckInNotSell
          acc.storeTotal += cur.storeTotal
          acc.summary += cur.summary
          acc.totalqty += cur.totalqty
          acc.percentVisit += cur.percentVisit
          acc.percentEffective += cur.percentEffective
          return acc
        },
        {
          area: areaKey,
          routeId: 'Total',
          route: `Total (${areaKey})`,
          storeAll: 0,
          storePending: 0,
          storeSell: 0,
          storeNotSell: 0,
          storeCheckInNotSell: 0,
          storeTotal: 0,
          summary: 0,
          totalqty: 0,
          percentVisit: 0,
          percentEffective: 0,
        }
      )

      const len = routesInArea.length || 1
      totalRoute.percentVisit = (totalRoute.percentVisit / len).toFixed(2)
      totalRoute.percentEffective = (totalRoute.percentEffective / len).toFixed(2)
      return totalRoute
    })


    // 📊 ถ้า export Excel
    if (excel === 'true') {
      const xlsxData = [...filteredRoutes, ...totalByArea].map(r => ({
        Area: r.area || area,
        Route: r.route,
        ร้านทั้งหมด: r.storeAll,
        รอเยี่ยม: r.storePending,
        ซื้อ: r.storeSell,
        เยี่ยม: r.storeCheckInNotSell + r.storeNotSell,
        ขาย: r.summary,
        ยอดหีบ: r.totalqty,
        เปอร์เซ็นต์การเข้าเยี่ยม: r.percentVisit,
        เปอร์เซ็นต์การขายได้: r.percentEffective,
      }))

      const wb = xlsx.utils.book_new()
      const ws = xlsx.utils.json_to_sheet(xlsxData)
      xlsx.utils.book_append_sheet(wb, ws, `getRouteEffective_${period}`)
      const filePath = path.join(os.tmpdir(), `getRouteEffective_${period}.xlsx`)
      xlsx.writeFile(wb, filePath)
      res.download(filePath, err => {
        fs.unlink(filePath, () => { })
        if (err) console.error(err)
      })
    } else {
      res.json({
        status: 200,
        data: filteredRoutes,
        totalByArea,

      })
    }
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }

}



exports.getRouteEffectiveAll = async (req, res) => {
  try {
    const { zone, area, team, period, day } = req.query

    const query = {}
    if (area) query.area = area
    if (period) query.period = period
    if (day) query.day = day

    const channel = req.headers['x-channel']
    const { Store, TypeStore } = getModelsByChannel(channel, res, storeModel)
    const { Route } = getModelsByChannel(channel, res, routeModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)

    let routes = await Route.find(query).populate(
      'listStore.storeInfo',
      'storeId name address typeName taxId tel'
    )

    if (zone) {
      routes = routes.filter(u => u.area.slice(0, 2) === zone)
      // console.log(routes)
    }

    if (routes.length == 0) {
      return res.status(404).json({
        status: 404,
        message: 'Not found route'
      })
    }
    if (team) {
      routes = routes.map(item => {
        const teamStr = item.area.substring(0, 2) + item.area.charAt(3)
        return {
          id: item.id,
          period: item.period,
          area: item.area,
          team: teamStr,
          day: item.day,
          listStore: item.listStore,
          storeAll: item.storeAll,
          storePending: item.storePending,
          storeSell: item.storeSell,
          storeNotSell: item.storeNotSell,
          storeCheckInNotSell: item.storeCheckInNotSell,
          storeTotal: item.storeTotal,
          percentComplete: item.percentComplete,
          complete: item.complete,
          percentVisit: item.percentVisit,
          percentEffective: item.percentEffective
        }
      })
    }

    let totalVisit = 0
    let totalEffective = 0
    let totalStoreAll = 0
    let totalStorePending = 0
    let totalStoreSell = 0
    let totalStoreNotSell = 0
    let totalStoreCheckInNotSell = 0
    let sumVisit = 0
    let count = 0

    // console.log(routes)
    // 🔹 กรองวันที่ไม่ใช่ 25 หรือ 26 ก่อน
    const excludedDays = ['25', '26'];

    const routesTranFrom = routes
      .filter(route => !excludedDays.includes(route.day))
      .map(u => {
        const percentVisit = Number(u.percentVisit) || 0;
        const percentEffective = Number(u.percentEffective) || 0;
        const storeAll = Number(u.storeAll) || 0;
        const storePending = Number(u.storePending) || 0;
        const storeSell = Number(u.storeSell) || 0;
        const storeNotSell = Number(u.storeNotSell + u.storeCheckInNotSell) || 0;
        const storeCheckInNotSell = Number(u.storeCheckInNotSell) || 0; // ✅ ชื่อถูกแล้ว
        const visit = Number(u.storeTotal) || 0;
        // const 


        totalVisit += percentVisit;
        totalEffective += percentEffective;
        totalStoreAll += storeAll;
        totalStorePending += storePending;
        totalStoreSell += storeSell;
        totalStoreNotSell += storeNotSell;
        totalStoreCheckInNotSell += storeCheckInNotSell;
        sumVisit += visit
        count++;

        return {
          area: u.area,
          percentVisit,
          percentEffective,
          storeAll,
          visit,
          storePending,
          storeSell,
          storeNotSell,
          storeCheckInNotSell,
        };
      });

    // ✅ สรุปค่าเฉลี่ย
    const percentVisitAvg = count > 0 ? totalVisit / count : 0;
    const percentEffectiveAvg = count > 0 ? totalEffective / count : 0;

    // const io = getSocket()
    // io.emit('route/getRouteEffectiveAll', {});

    res.status(200).json({
      status: 200,
      message: 'sucess',
      // data: routesTranFrom
      visit: to2(percentVisitAvg),
      effective: to2(percentEffectiveAvg),
      totalStoreAll: to2(totalStoreAll),

      totalStorePending: to2(totalStorePending),
      // totalStorePending: to2(totalStoreAll - sumVisit),

      totalStoreSell: to2(totalStoreSell),
      totalStoreNotSell: to2(totalStoreNotSell),
      // totalStoreCheckInNotSell: to2(totalStoreCheckInNotSell)
      totalStoreCheckInNotSell: to2(sumVisit)
    })
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })

  }

}

exports.getAreaInRoute = async (req, res) => {
  try {
    const { period } = req.query
    const channel = req.headers['x-channel']
    const { Route } = getModelsByChannel(channel, res, routeModel)

    const routes = await Route.aggregate([
      {
        $match: { period: period }
      },
      {
        $addFields: {
          area2: { $substrCP: ['$area', 0, 2] }
        }
      },
      {
        $group: {
          _id: '$area2'
        }
      },
      {
        $project: {
          zone: '$_id',
          _id: 0
        }
      },
      {
        $sort: { zone: 1 }
      }
    ])

    if (routes.length == 0) {
      return res.status(404).json({
        status: 404,
        message: 'Not found route'
      })
    }

    res.status(200).json({
      status: 200,
      message: 'sucess',
      data: routes
    })
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }

}

exports.getZoneInRoute = async (req, res) => {
  try {
    const { zone, period, team } = req.query
    const channel = req.headers['x-channel']
    const { Route } = getModelsByChannel(channel, res, routeModel)

    const pipeline = [
      {
        $match: { period: period }
      },
      {
        $addFields: {
          area2: { $substrCP: ['$area', 0, 2] },
          team3: {
            $concat: [
              { $substrCP: ['$area', 0, 2] }, // "BE"
              { $substrCP: ['$area', 3, 1] } // "1" → from "212" (character at index 3)
            ]
          }
        }
      }
    ]

    if (zone && zone.length) {
      const zoneArray = typeof zone === 'string' ? zone.split(',') : zone
      pipeline.push({
        $match: { area2: { $in: zoneArray } }
      })
    }

    if (team && team.length) {
      pipeline.push({
        $match: { team3: team }
      })
    }

    pipeline.push(
      {
        $group: { _id: '$area' }
      },
      {
        $project: { area: '$_id', _id: 0 }
      },
      {
        $sort: { area: 1 }
      }
    )

    const routes = await Route.aggregate(pipeline)

    if (routes.length == 0) {
      return res.status(404).json({
        status: 404,
        message: 'Not found zone'
      })
    }

    res.status(200).json({
      status: 200,
      message: 'sucess',
      data: routes
    })
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }

}

exports.getRouteByArea = async (req, res) => {
  try {
    const { area, period } = req.query
    const channel = req.headers['x-channel']
    const { Route } = getModelsByChannel(channel, res, routeModel)

    const match = {}
    if (period) match.period = period
    if (area) match.area = area

    const data = await Route.aggregate([
      { $match: match },
      {
        $project: {
          routeId: '$id',
          route: { $concat: ['R', '$day'] },
          day: '$day',
          _id: 0
        }
      }
    ])
    if (data.length == 0) {
      return res.status(404).message({
        status: 404,
        message: 'Not found route'
      })
    }

    // const io = getSocket()
    // io.emit('route/getRouteByArea', {});

    res.status(200).json({
      status: 200,
      message: 'sucess',
      data: data
    })
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }

}

exports.checkRouteStore = async (req, res) => {
  try {
    const { zone, period, team } = req.query
    const channel = req.headers['x-channel']
    const { Route } = getModelsByChannel(channel, res, routeModel)
    const { Store } = getModelsByChannel(channel, res, storeModel)

    const queryZone = {}
    if (zone) {
      queryZone.zone = zone
    }

    // === Build pipeline ===
    const pipeline = [
      {
        $addFields: {
          zone: { $substrBytes: ['$area', 0, 2] },
          team3: {
            $concat: [
              { $substrCP: ['$area', 0, 2] },
              { $substrCP: ['$area', 3, 1] }
            ]
          }
        }
      },
      // Filter zone & period
      {
        $match: {
          ...queryZone,
          period
        }
      }
    ]

    // ==== แทรก team filter ตรงนี้ หลัง $addFields/$match ====
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
          area: 1,
          day: 1,
          storeCount: { $size: '$listStore' }
        }
      },
      {
        $group: {
          _id: { area: '$area', day: '$day' },
          count: { $sum: '$storeCount' }
        }
      }
    )

    const dataRoute = await Route.aggregate(pipeline)

    const zoneList = [...new Set(dataRoute.map(u => u._id.area.slice(0, 2)))]

    const allStores = await Store.find({
      zone: zoneList,
      route: { $in: ['DEL', /^R/] }
    }).select('area route')

    const storeCountMap = {}
    for (const store of allStores) {
      const area = store.area
      if (!storeCountMap[area]) storeCountMap[area] = { R: 0, del: 0 }

      if (store.route === 'DEL') storeCountMap[area].del++
      else if (/^R/.test(store.route)) storeCountMap[area].R++
    }

    const areaMap = {}

    for (const item of dataRoute) {
      const area = item._id.area
      const day = item._id.day
      const key = day.startsWith('R') ? day : `R${day}`

      if (!areaMap[area]) areaMap[area] = { area }

      areaMap[area][key] = item.count
      areaMap[area].R = storeCountMap[area]?.R || 0
      areaMap[area].del = storeCountMap[area]?.del || 0
    }

    function sortKeys(obj) {
      const { area, R, del, ...days } = obj
      const sortedDays = Object.keys(days)
        .filter(k => /^R\d+$/.test(k))
        .sort((a, b) => +a.slice(1) - +b.slice(1))

      const newObj = { area }
      for (const k of sortedDays) newObj[k] = obj[k]
      if (R !== undefined) newObj.R = R
      if (del !== undefined) newObj.del = del
      return newObj
    }

    const result = Object.values(areaMap)
      .map(sortKeys)
      .sort((a, b) => a.area.localeCompare(b.area))

    res.status(200).json({
      status: 200,
      message: 'success',
      data: result
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: 500, message: 'Internal server error' })
  }
}

exports.polylineRoute = async (req, res) => {
  try {
    const { area, period, startDate, endDate } = req.query
    const channel = req.headers['x-channel']
    const { Route } = getModelsByChannel(channel, res, routeModel)
    const { Store } = getModelsByChannel(channel, res, storeModel)

    const pipeline = [
      {
        $match: {
          area: area,
          period: period
        }
      }
    ]

    if (startDate && endDate) {
      const startTH = new Date(
        `${startDate.slice(0, 4)}-${startDate.slice(4, 6)}-${startDate.slice(
          6,
          8
        )}T00:00:00+07:00`
      )
      const endTH = new Date(
        `${endDate.slice(0, 4)}-${endDate.slice(4, 6)}-${endDate.slice(
          6,
          8
        )}T23:59:59.999+07:00`
      )
      pipeline.push(
        {
          $addFields: {
            listStore: {
              $filter: {
                input: '$listStore',
                as: 's',
                cond: {
                  $and: [
                    { $gte: ['$$s.date', startTH] },
                    { $lt: ['$$s.date', endTH] }
                  ]
                }
              }
            }
          }
        },
        { $match: { 'listStore.0': { $exists: true } } }
      )
    }

    // const dataRoute = await Route.find({ area, period })
    const dataRoute = await Route.aggregate(pipeline)

    const storeId = dataRoute.flatMap(item =>
      item.listStore.map(i => i.storeInfo)
    )

    const objectIds = storeId
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id))

    const dataStore = await Store.find({ _id: { $in: objectIds } })

    const locations = dataRoute
      .flatMap(item =>
        item.listStore
          .filter(u => {
            const lat = parseFloat(u.latitude)
            const lng = parseFloat(u.longtitude)
            return !isNaN(lat) && !isNaN(lng)
          })
          .map(u => {
            const store = dataStore.find(s => s._id.equals(u.storeInfo))
            const dateObj = new Date(u.date)
            return {
              storeId: store?.storeId,
              route: `R${item.day}`,
              date: formatDateTimeToThai(u.date),
              timestamp: dateObj.getTime(),
              location: [parseFloat(u.longtitude), parseFloat(u.latitude)]
            }
          })
      )
      .sort((a, b) => a.timestamp - b.timestamp)

    if (locations.length === 0) {
      return res.status(404).json({
        status: 404,
        message: 'Not found latitude, locations'
      })
    }

    const finalLocations = locations.map(({ timestamp, ...rest }) => rest)

    res.status(200).json({
      status: 200,
      message: 'success',
      data: finalLocations
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: 500, message: 'Internal server error' })
  }
}

exports.addRouteIt = async (req, res) => {
  try {
    const { period } = req.body
    const channel = req.headers['x-channel']
    const { Route } = getModelsByChannel(channel, res, routeModel)
    const { Store } = getModelsByChannel(channel, res, storeModel)

    const now = new Date()
    const startOfDay = new Date(now.setHours(0, 0, 0, 0) - 7 * 60 * 60 * 1000)
    const endOfDay = new Date(now.setHours(23, 59, 59, 999) - 7 * 60 * 60 * 1000)

    const dataStore = await Store.find({
      area: 'IT211',
      status: { $ne: '90' },
      createdAt: { $gte: startOfDay, $lt: endOfDay }
    })

    let route = []

    for (let i = 1; i <= 1; i++) {
      const idx2 = String(i).padStart(2, '0') // "01".."25"
      const data = {
        id: `${period}IT211R${idx2}`,
        period: period,
        area: 'IT211',
        day: i,
        listStore: dataStore.map(item => {
          return {
            storeInfo: item._id,
            note: '',
            image: '',
            latitude: '',
            longtitude: '',
            status: 0,
            statusText: 'รอเยี่ยม',
            listOrder: [],
            date: ''
          }
        })
      }
      route.push(data)
    }

    Route.create(route)

    res.status(200).json({
      status: 200,
      message: 'sucess',
      data: route
    })
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }

}

exports.addStoreOneToRoute = async (req, res) => {
  try {
    const { storeId, routeId } = req.body
    const channel = req.headers['x-channel']
    const { Route } = getModelsByChannel(channel, res, routeModel)
    const { Store } = getModelsByChannel(channel, res, storeModel)

    const storeData = await Store.findOne({ storeId: storeId })

    for (const i of routeId) {
      const routeData = await Route.findOne({ id: i }) // ถ้า id เป็น unique

      if (!routeData) continue // ตรวจสอบว่ามีข้อมูลจริง

      const newData = {
        storeInfo: storeData._id,
        note: '',
        image: '',
        latitude: '',
        longtitude: '',
        status: 0,
        statusText: 'รอเยี่ยม',
        listOrder: [],
        date: ''
      }

      routeData.listStore.push(newData)

      await routeData.save() // สำคัญ: บันทึกกลับเข้า MongoDB
    }

    res.status(200).json({
      status: 200,
      message: 'sucess'
      // data: newData
    })
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }

}

exports.getLatLongStore = async (req, res) => {
  try {
    const { storeId } = req.body
    const channel = req.headers['x-channel']
    const { Route } = getModelsByChannel(channel, res, routeModel)
    const { Store } = getModelsByChannel(channel, res, storeModel)

    const storeData = await Store.findOne({ storeId: storeId }).select('_id area')

    const routeData = await Route.aggregate([
      { $unwind: '$listStore' },
      {
        $match: {
          'listStore.storeInfo': String(storeData._id)
        }
      }
    ])

    let data = []
    for (const i of routeData) {
      if (i.listStore.status === '0') {
        continue
      }
      dataTran = {
        id: i.id,
        period: i.period,
        lat: i.listStore.latitude,
        long: i.listStore.longtitude
      }

      data.push(dataTran)
    }

    if (data.length === 0) {
      return res.status(404).json({
        status: 404,
        message: 'Not found Lat Long'
      })
    }

    res.status(200).json({
      status: 200,
      message: 'Sucess',
      data: data
    })
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }

}

exports.addRadius = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { Radius } = getModelsByChannel(channel, res, radiusModel)
    const { radius, period } = req.body
    await Radius.create({
      radius: 50,
      period: '202509'
    })
    res.status(200).json({
      status: 200,
      message: 'Sucess'
      // data: data
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ ok: false, message: error.message })
  }
}

exports.getRadius = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { Radius } = getModelsByChannel(channel, res, radiusModel)
    const { period } = req.query
    const data = await Radius.findOne({ period })
    res.status(200).json({
      status: 200,
      message: 'Sucess',
      data: data
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ ok: false, message: error.message })
  }
}

exports.updateRouteAllStore = async (req, res) => {
  try {
    const { storeId } = req.body
    const channel = req.headers['x-channel']
    const { Route } = getModelsByChannel(channel, res, routeModel)
    const { Store } = getModelsByChannel(channel, res, storeModel)

    const storeData = await Store.find({
      area: { $nin: ['IT211', null, ''] }
    })
      .select('_id storeId')
      .lean()

    let dataFinal = []
    const BATCH = 20;                 // ปรับตามแรงเครื่อง/DB
    let loopCount = 0;

    for (let i = 0; i < storeData.length; i += BATCH) {
      const chunk = storeData.slice(i, i + BATCH);

      await Promise.all(chunk.map(async (item) => {
        loopCount++;

        const latest = await Route.aggregate([
          // { $match: { period } }, // ถ้ามีก็เปิดได้
          { $unwind: '$listStore' },
          {
            $match: {
              'listStore.storeInfo': String(item._id),
              'listStore.status': { $ne: '0' }
            }
          },
          { $sort: { 'listStore.date': -1 } },
          { $limit: 1 },
          {
            $project: {
              day: { $concat: ['R', { $toString: '$day' }] },
              period: 1,
              lat: '$listStore.latitude',
              long: '$listStore.longtitude',
              date: '$listStore.date'
            }
          }
        ]);

        if (latest.length === 0) return;

        const dataUpdated = await Store.findOneAndUpdate(
          { storeId: item.storeId },
          {
            $set: {
              route: latest[0].day,
              latitude: latest[0].lat,
              longtitude: latest[0].long
            }
          },
          { new: true, runValidators: true }
        );

        dataFinal.push(dataUpdated);
      }));

      console.log(`processed ${Math.min(i + BATCH, storeData.length)} / ${storeData.length}`);
    }

    console.log(`total loop: ${loopCount}`);


    res.status(200).json({
      status: 200,
      message: 'Sucess',
      data: dataFinal
    })
  } catch (error) {
    console.error('❌ Error:', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }


}


exports.addRouteByArea = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { period, area } = req.body
    const result = await routeQuery(channel, area)
    const return_arr = []

    for (const row of result) {
      const area = String(row.area ?? '').trim()
      const id = String(row.id ?? '').trim()
      const day = String(row.day ?? '').trim()
      const storeId = String(row.storeId ?? '').trim()

      const storeInfo = {
        storeInfo: storeId,
        latitude: '',
        longtitude: '',
        note: '',
        status: '0',
        statusText: '',
        date: '',
        listOrder: []
      }

      let groupFound = false

      for (const group of return_arr) {
        if (group.id === id && group.area === area) {
          group.listStore.push(storeInfo)
          groupFound = true
          break
        }
      }

      if (!groupFound) {
        return_arr.push({
          id,
          area,
          period,
          day,
          listStore: [storeInfo]
        })
      }
    }

    const { Store } = getModelsByChannel(channel, res, storeModel)
    const { Route } = getModelsByChannel(channel, res, routeModel)
    const route = await Route.find({ period: period })
    const routeMap = new Map(route.map(route => [route.id, route]))
    let routeId
    const latestRoute = route.sort((a, b) => b.id.localeCompare(a.id))[0]
    if (!latestRoute) {
      routeId = `${period}${return_arr.area}R01`

    } else {
      const prefix = latestRoute.id.slice(0, 6)
      const subfix = (parseInt(latestRoute.id.slice(7)) + 1)
        .toString()
        .padStart(2, '0')
      routeId = prefix + subfix
    }

    for (const storeList of return_arr) {
      try {
        const existingRoute = routeMap.get(storeList.id)

        if (existingRoute) {
          for (const list of storeList.storeInfo || []) {
            const store = await Store.findOne({ storeId: list })
            if (!store) {
              // console.warn(`Store with storeId ${list} not found`)
              continue
            }

            const storeExists = existingRoute.listStore.some(
              store => store.storeInfo.toString() === store._id.toString()
            )
            if (!storeExists) {
              const newData = {
                storeInfo: store._id,
                note: '',
                image: '',
                latitude: '',
                longtitude: '',
                status: 0,
                statusText: 'รอเยี่ยม',
                listOrder: [],
                date: ''
              }
              existingRoute.listStore.push(newData)
            }
          }
          await existingRoute.save()
        } else {
          const listStore = []

          for (const storeId of storeList.listStore || []) {
            const idStore = storeId.storeInfo
            const store = await Store.findOne({ storeId: idStore })
            if (store) {
              listStore.push({
                storeInfo: store._id,
                latitude: '',
                longtitude: '',
                status: 0,
                statusText: 'รอเยี่ยม',
                note: '',
                date: '',
                listOrder: []
              })
            } else {
              // console.warn(`Store with storeId ${storeId} not found`)
            }
          }

          const data = {
            id: storeList.id,
            area: storeList.area,
            period: period,
            day: storeList.day,
            listStore
          }
          await Route.create(data)
        }
      } catch (err) {
        console.error(
          `Error processing storeList with id ${storeList.id}:`,
          err.message
        )
        continue
      }
    }

    const io = getSocket()
    io.emit('route/addFromERPnew', {})

    res.status(200).json({
      status: 200,
      message: 'sucess'
      // data: return_arr
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

