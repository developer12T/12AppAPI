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
const orderModel = require('../../models/cash/sale')
const routeModel = require('../../models/cash/route')
const storeModel = require('../../models/cash/store')
const { getModelsByChannel } = require('../../middleware/channel')
const path = require('path')
const { json } = require('body-parser')

exports.getRoute = async (req, res) => {
  try {
    const { period, area, district, province, routeId } = req.query;
    const channel = req.headers['x-channel'];

    const { Store, TypeStore } = getModelsByChannel(channel, res, storeModel);
    const { Route } = getModelsByChannel(channel, res, routeModel);
    if (!period) {
      return res.status(400).json({ status: 400, message: 'period is required' });
    }

    const query = { period };
    if (area) query.area = area;
    if (routeId) query.id = routeId;

    const routes = await Route.find(query).populate(
      'listStore.storeInfo',
      'storeId name address typeName taxId tel'
    );

    const filteredRoutes = routes
      .map(route => {
        const filteredListStore = route.listStore.filter(store => {
          const addr = (store.storeInfo?.address || '').toLowerCase();

          const matchDistrict = district ? addr.includes(district.toLowerCase()) : true;
          const matchProvince = province ? addr.includes(province.toLowerCase()) : true;

          return matchDistrict && matchProvince;
        });

        return {
          ...route.toObject(),
          listStore: filteredListStore
        };
      })
      .filter(route => route.listStore.length > 0);

    // console.log(filteredRoutes)


    const allStoreIds = filteredRoutes.flatMap(route =>
      route.listStore.map(s => s.storeInfo?.storeId).filter(Boolean)
    );


    const storeTypes = await TypeStore.find({
      storeId: { $in: allStoreIds }
    }).select('storeId type');


    const storeTypeMap = new Map(
      storeTypes.map(s => [s.storeId, s.type])
    );


    const enrichedRoutes = filteredRoutes.map(route => {
      const enrichedListStore = route.listStore.map(itemRaw => {
        const item = itemRaw.toObject ? itemRaw.toObject() : itemRaw;
        const storeInfo = item.storeInfo?.toObject ? item.storeInfo.toObject() : item.storeInfo || {};
        const type = storeTypeMap.get(storeInfo.storeId);

        return {
          ...item,
          storeInfo,
          storeType: type || []
        };
      });

      return {
        ...route,
        listStore: enrichedListStore
      };
    });

    res.status(200).json({
      status: 200,
      message: 'Success',
      data: enrichedRoutes
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 500, message: err.message });
  }
};

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

  const channel = req.headers['x-channel'];
  const { Store } = getModelsByChannel(channel, res, storeModel);
  const { Route } = getModelsByChannel(channel, res, routeModel);



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
    const channel = req.headers['x-channel']

    const { Store } = getModelsByChannel(channel, res, storeModel)

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
      console.log('12', JSON.stringify(changeLogs, null, 2))

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

      // await RouteChangeLog.updateMany(
      //   { area: currentArea, period, status: '0' },
      //   { $set: { status: '1' } }
      // )
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
      console.log("existingRoute")
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
}

exports.getRouteProvince = async (req, res) => {

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
        storeObjId: { $toObjectId: "$listStore.storeInfo" }
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
        province: "$_id",
      }
    },
  ])

  if (route.length == 0) {
    return res.status(404).json({
      status: 404,
      message: "Not found province this area"
    })
  }


  const result = route.flatMap(item => item.province).filter(p => p && p.trim() !== '');

  res.status(200).json({
    status: 200,
    message: "successful",
    data: result
  })
}


exports.getRouteEffective = async (req, res) => {

  const { area, period } = req.body

  const channel = req.headers['x-channel']

  const { Store, TypeStore } = getModelsByChannel(channel, res, storeModel);
  const { Route } = getModelsByChannel(channel, res, routeModel);
  const { Order } = getModelsByChannel(channel, res, orderModel);


  const routes = await Route.find({ area: area, period: period }).populate(
    'listStore.storeInfo',
    'storeId name address typeName taxId tel'
  );

  // console.log("routes",routes)
  if (routes.length == 0) {
    return res.status(404).json({
      status: 404,
      message: 'Not found route'
    })
  }



  const orderIdList = routes.flatMap(u =>
    (u.listStore || []).flatMap(i =>
      (i.listOrder || []).map(order => order.orderId)
    )
  );
  const orderDetail = await Order.find({ orderId: { $in: orderIdList } })

  const routesTranFrom = routes.map(u => {
    const totalSummary = u.listStore?.flatMap(i =>
      i.listOrder?.map(order => {
        const detail = orderDetail.find(d => d.orderId === order.orderId);
        return detail?.total || 0;
      }) || []
    ).reduce((sum, val) => sum + val, 0) || 0;

    return {
      routeId: u.id,
      route: u.id.slice(-3),
      storeAll: u.storeAll,
      storePending: u.storePending,
      storeSell: u.storeSell,
      storeNotSell: u.storeNotSell,
      storeCheckInNotSell: u.storeCheckInNotSell,
      storeTotal: u.storeTotal,
      percentComplete: u.percentComplete,
      complete: u.complete,
      percentVisit: u.percentVisit,
      percentEffective: u.percentEffective,
      summary: totalSummary
    };
  });



  res.status(200).json({
    status: 200,
    message: "successful",
    data: routesTranFrom
  })

}



exports.getRouteEffectiveAll = async (req, res) => {

  const { zone, area, period } = req.body

  const query = {};
  if (area) query.area = area;
  if (period) query.period = period;

  const channel = req.headers['x-channel'];
  const { Store, TypeStore } = getModelsByChannel(channel, res, storeModel);
  const { Route } = getModelsByChannel(channel, res, routeModel);
  const { Order } = getModelsByChannel(channel, res, orderModel);

  const routes = await Route.find(query).populate(
    'listStore.storeInfo',
    'storeId name address typeName taxId tel'
  );
  if (routes.length == 0) {
    return res.status(404).json({
      status: 404,
      message: 'Not found route'
    })
  }


  const orderIdList = routes.flatMap(u =>
    (u.listStore || []).flatMap(i =>
      (i.listOrder || []).map(order => order.orderId)
    )
  );
  const orderDetail = await Order.find({ orderId: { $in: orderIdList } })

  const routesTranFrom = routes.map(u => {
    const totalSummary = u.listStore?.flatMap(i =>
      i.listOrder?.map(order => {
        const detail = orderDetail.find(d => d.orderId === order.orderId);
        return detail?.total || 0;
      }) || []
    ).reduce((sum, val) => sum + val, 0) || 0;

    return {
      routeId: u.id,
      route: u.id.slice(-3),
      storeAll: u.storeAll,
      storePending: u.storePending,
      storeSell: u.storeSell,
      storeNotSell: u.storeNotSell,
      storeCheckInNotSell: u.storeCheckInNotSell,
      storeTotal: u.storeTotal,
      percentComplete: u.percentComplete || 0,
      complete: u.complete || 0,
      percentVisit: u.percentVisit || 0,
      percentEffective: u.percentEffective || 0,
      summary: totalSummary
    };
  });





  res.status(200).json({
    status: 200,
    message: 'sucess',
    data: routesTranFrom
  })
}


exports.getAreaInRoute = async (req, res) => {

  const { period } = req.body
  const channel = req.headers['x-channel'];
  const { Route } = getModelsByChannel(channel, res, routeModel);



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
  ]);

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
}


exports.getZoneInRoute = async (req, res) => {

  const { zone, period } = req.body
  const channel = req.headers['x-channel'];
  const { Route } = getModelsByChannel(channel, res, routeModel);

  const pipeline = [
    {
      $match: { period: period }
    },
    {
      $addFields: {
        area2: { $substrCP: ['$area', 0, 2] }
      }
    }
  ];

  if (zone) {
    pipeline.push({
      $match: { area2: zone }
    });
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
  );

  const routes = await Route.aggregate(pipeline);

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
}