// const { query } = require('express')
const axios = require('axios')
const { Route, RouteChangeLog } = require('../../models/cash/route')
const { period, previousPeriod } = require('../../utilities/datetime')
const { Store } = require('../../models/cash/store')
const { uploadFiles } = require('../../utilities/upload')
const multer = require('multer')
const upload = multer({ storage: multer.memoryStorage() }).array(
  'checkInImage',
  1
)

const path = require('path')
const { forEach } = require('lodash')

exports.getRoute = async (req, res) => {
  try {
    const { storeId, area, period, routeId, province,district  } = req.query

    if (storeId && period) {



    if (!period) {
      return res
        .status(400)
        .json({ status: '400', message: 'period is required!' })
    }

    let query = { period }
    let response = []
    let store = null

    if (storeId) {
      store = await Store.findOne({ storeId }).select('_id')
      if (!store) {
        return res
          .status(404)
          .json({ status: '404', message: 'Store not found!' })
      }
    }

    if (area && !routeId && !storeId) {
      query.area = area
      const routes = await Route.find(query, { _id: 0, __v: 0 })

      response = routes.map(route => ({
        id: route.id,
        period: route.period,
        area: route.area,
        day: route.day,
        storeAll: route.storeAll,
        storePending: route.storePending,
        storeSell: route.storeSell,
        storeNotSell: route.storeNotSell,
        storeTotal: route.storeTotal,
        percentComplete: route.percentComplete,
        percentVisit: route.percentVisit,
        percentEffective: route.percentEffective
      }))
    } else if (area && routeId && !storeId) {
      query.area = area
      query.id = routeId

      const routes = await Route.findOne(query).populate(
        'listStore.storeInfo',
        'storeId name address typeName taxId tel'
      )

      if (!routes) {
        return res
          .status(404)
          .json({ status: '404', message: 'Route not found!' })
      }

      const sortedListStore = routes.listStore.sort((a, b) => {
        const statusA = parseInt(a.status, 10)
        const statusB = parseInt(b.status, 10)
        return statusA - statusB
      })

      response = [
        {
          ...routes.toObject(),
          listStore: sortedListStore
        }
      ]
    } else if (area && routeId && storeId) {
      query.area = area
      query.id = routeId

      const routes = await Route.findOne(query).populate(
        'listStore.storeInfo',
        'storeId name address typeName taxId tel'
      )

      if (!routes) {
        return res
          .status(404)
          .json({ status: '404', message: 'Route not found!' })
      }

      response = [
        {
          ...routes.toObject(),
          listStore: routes.listStore.filter(
            store => store.storeInfo && store.storeInfo.storeId === storeId
          )
        }
      ]
    } else if (!area && !routeId && storeId) {
      const routes = await Route.find({
        period,
        'listStore.storeInfo': store._id
      }).populate(
        'listStore.storeInfo',
        'storeId name address typeName taxId tel'
      )

      response = routes.map(route => ({
        ...route.toObject(),
        listStore: route.listStore.filter(
          store => store.storeInfo && store.storeInfo.storeId === storeId
        )
      }))
    } else {
      return res
        .status(400)
        .json({ status: '400', message: 'params is required!' })
    }

    res.status(200).json({
      status: '200',
      message: 'Success',
      data: response
    })
  }

  if (period && province && district ) {



    
      res.status(200).json({
        message:period,province,district
      })




  }


  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.addFromERP = async (req, res) => {
  try {
    const response = await axios.post(
      'http://58.181.206.159:9814/ca_api/ca_route.php'
    )
    if (!response.data || !Array.isArray(response.data)) {
      return res.status(400).json({
        status: '400',
        message: 'Invalid response data from external API'
      })
    }

    const route = await Route.find({ period: period() })
    const routeMap = new Map(route.map(route => [route.id, route]))
    let routeId
    const latestRoute = route.sort((a, b) => b.id.localeCompare(a.id))[0]
    if (!latestRoute) {
      routeId = `${period()}${response.data.area}R01`
      console.log('route', routeId)
      console.log('period', period())
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

exports.checkIn = async (req, res) => {
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

      let image = null
      if (req.files) {
        try {
          const files = req.files
          const uploadedFile = await uploadFiles(
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
            'listStore.$.status': '2',
            'listStore.$.statusText': 'ไม่ซื้อ',
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

      let image = null
      if (req.files) {
        try {
          const files = req.files
          const uploadedFile = await uploadFiles(
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

    res.status(201).json({
      status: '201',
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

      console.log('12', changedStoreMap)

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

        await newRoute.save()
        newRoutes.push(newRoute)
      }

      await RouteChangeLog.updateMany(
        { area: currentArea, period, status: '0' },
        { $set: { status: '1' } }
      )
    }

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

exports.geTimelineCheckin = async (req, res) => {
  try {
    const { area } = req.query

    if (!area) {
      return res
        .status(400)
        .json({ status: '400', message: 'params is required!' })
    }

    const data = await Route.find(
      {
        listStore: { $elemMatch: { status: { $ne: '0' } } },
        area: `${area}`
      },
      {
        listStore: { $elemMatch: { status: { $ne: '0' } } },
        area: 1,
        period: 1,
        id: 1
      },
      {
        'listStore.date': 1
      }
    )

    const result = data.map(item => {
      const utcDate = new Date(item.listStore[0].date)
      // Convert to Bangkok time (UTC+7)
      const bangkokDate = new Date(utcDate.getTime() + 7 * 60 * 60 * 1000)

      return {
        id: item.id,
        period: item.period,
        area: item.area,
        note: item.listStore[0].note,
        latitude: item.listStore[0].latitude,
        longtitude: item.listStore[0].longtitude,
        statusText: item.listStore[0].statusText,
        date: bangkokDate
      }
    })
    if (!result) {
      res.status(404).json({
        status: 404,
        message: 'Not Found'
      })
    }

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

    // const routeAll = await Route.aggregate([
    //   { $unwind: '$listStore' },
    //   { $match: { 'listStore.status': { $ne: '0' } } },
    //   {
    //     $group: {
    //       _id: { area: '$area', period: '$priod' },
    //       count: { $sum: 1 }
    //     }
    //   },
    //   { $sort: { count: -1 } },
    //   {
    //     $project: {
    //       area: '$_id.area',
    //       period: '$period',
    //       count: 1,
    //       _id: 0
    //     }
    //   }
    // ])
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

    // const data = await aggregate.exec()

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


exports.routeTimeline = async(req,res) => {
try {
  const { area, day, period } = req.body

  const modelRoute = await Route.findOne({area:area,day:day,period:period})

  // console.log(modelRoute)

  if (modelRoute) {

    const tranFromRoue = modelRoute.listStore.map(route => {
      const date = new Date(route.date || "");
      // console.log(date)
      if (isNaN(date)) {
        return { date: "", hour: "" };
      }
    
      const bangkokDate = new Date(
        date.toLocaleString("en-US", { timeZone: "Asia/Bangkok" })
      );
    
      return {
        date: bangkokDate.toLocaleString("th-TH", {
          timeZone: "Asia/Bangkok",
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: false
        }),
        hour: bangkokDate.getHours()
      };
    });
  
    
    const hourCountMap = {};
  
    // กรองข้อมูลเฉพาะเวลาที่อยู่ในช่วง 5 โมงเช้าถึง 6 โมงเย็น (05:00-17:59)
    tranFromRoue.forEach(item => {
      if (item.hour >= 5 && item.hour <= 18) {
        hourCountMap[item.hour] = (hourCountMap[item.hour] || 0) + 1;
      }
    });
    
    // สร้างข้อมูลที่แสดงทุกชั่วโมงในช่วง 5-17 และกรอก count = 0 สำหรับชั่วโมงที่ไม่มีข้อมูล
    const data = [];
    for (let hour = 5; hour <= 18; hour++) {
      data.push({
        time: String(hour).padStart(2, '0') + ":00",
        count: hourCountMap[hour] || 0
      });
    }
      
  res.status(200).json({
    response:data
  })

  }
  else {
    return res.status(404).json({
      message:`Not Found this ${area} day: ${day} `
    })
  }





} catch (error) {
  console.error(error)
  res.status(500).json({ message: 'Internal server error.' })
}
}
