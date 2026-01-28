// const { query } = require('express')
const axios = require('axios')
const { Route, RouteChangeLog } = require('../../models/cash/route')
const {
  period,
  periodNew,
  previousPeriod,
  generateDates
} = require('../../utilities/datetime')
// const { Store } = require('../../models/cash/store')
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
  routeQueryOne,
  getDataRoute
} = require('../../controllers/queryFromM3/querySctipt')
const userModel = require('../../models/cash/user')
const targetVisitModel = require('../../models/cash/targetVisit')
const orderModel = require('../../models/cash/sale')
const routeModel = require('../../models/cash/route')
const radiusModel = require('../../models/cash/radius')
const storeModel = require('../../models/cash/store')
const productModel = require('../../models/cash/product')
const storeLatLongModel = require('../../models/cash/storeLatLong')
const { getSocket } = require('../../socket')
const { getModelsByChannel } = require('../../middleware/channel')
const path = require('path')
const { formatDateTimeToThai } = require('../../middleware/order')
const fs = require('fs')
const os = require('os')
const moment = require('moment')
const { flatMap } = require('lodash')

exports.updateAreaByDataRoute = async (req, res) => {
  try {
    // const { Store, TypeStore } = getModelsByChannel('cash', res, storeModel)
    // const dataRoute = await getDataRoute()

    // const storeIdList = dataRoute
    //   .flatMap(item => item.CUSCODE)
    //   .map(v => String(v).trim())
    //   .filter(v => v !== '')

    // const area = 'ET211'
    // const zone = 'ET'
    // const team = 'ET1'

    // await Store.updateMany(
    //   {
    //     storeId: { $in: storeIdList }
    //   },
    //   {
    //     $set: {
    //       area,
    //       zone,
    //       team
    //     }
    //   }
    // )

    res.status(201).json({
      status: 201,
      message: 'updateAreaByDataRoute'
      // data: storeIdList,
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

exports.addRouteSettings = async (req, res) => {
  try {
    const { period, lock, startDate } = req.body
    const channel = req.headers['x-channel']
    const { Route, RouteSetting } = getModelsByChannel(channel, res, routeModel)
    const { Store } = getModelsByChannel(channel, res, storeModel)
    const { User } = getModelsByChannel('cash', res, userModel)

    const routeLockExit = await RouteSetting.find({ period: period }).select(
      'area'
    )
    const areaExitList = routeLockExit.flatMap(item => item.area)

    const userData = await User.find({
      role: 'sale',
      platformType: 'CASH',
      area: { $nin: areaExitList }
    })

    const routeData = await Route.find({ period: period })
    const storeIdObj = [
      ...new Set(
        routeData.flatMap(item => item.listStore.map(u => u.storeInfo))
      )
    ]
    const storeData = await Store.find({
      _id: { $in: storeIdObj }
    })
    let areaList = []
    for (const user of userData) {
      let lockRoute = []

      const routeUser = routeData.filter(item => item.area === user.area)

      for (const row of routeUser) {
        const listStore = []
        for (const item of row.listStore) {
          const storeDetail = storeData.find(
            s => s._id.toString() === item.storeInfo
          )
          const storeTran = {
            // _id:
            storeId: storeDetail.storeId,
            storeInfo: storeDetail._id,
            lock: lock
          }

          listStore.push(storeTran)
        }
        const lockRouteTran = {
          id: row.id,
          route: row.day,
          lock: lock,
          listStore
        }
        lockRoute.push(lockRouteTran)
      }

      const dataTran = {
        area: user.area,
        period: period,
        lock: true,
        startDate: startDate,
        lockRoute: lockRoute
      }
      areaList.push(user.area)
      await RouteSetting.create(dataTran)
    }

    res.status(200).json({
      status: 201,
      message: `add to ${areaList} ${period} addRouteSettings success `
      // message:'sssssssssssssssss'
    })
  } catch (error) {
    console.error('error:', error)
    return res.status(500).json({
      status: 500,
      message: 'Server error',
      error: error.message
    })
  }
}

exports.getRouteLock = async (req, res) => {
  try {
    const { period, area, district, province, routeId, storeId, zone, team } =
      req.query
    const channel = req.headers['x-channel']

    const { Store, TypeStore } = getModelsByChannel(channel, res, storeModel)
    const { Route, RouteSetting } = getModelsByChannel(channel, res, routeModel)

    if (!period) {
      return res
        .status(400)
        .json({ status: 400, message: 'period is required' })
    }

    let routeSetting = []

    if (area) {
      routeSetting = await RouteSetting.findOne({ period: period, area: area })

      dates = generateDates(routeSetting.startDate, 24)
    }

    const query = { period }
    if (area) query.area = area
    if (routeId) query.id = routeId

    const routes = await Route.find(query)
      .populate(
        'listStore.storeInfo',
        'storeId name address typeName taxId tel'
      )
      .sort({ day: 1 })

    // console.log(routes)

    let data = []

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

        const dateMacth = dates.find(u => String(u.day) === String(route.day))

        const thaiDate = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Bangkok',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(new Date())

        if (dateMacth.date === thaiDate) {
          canSell = true
        } else {
          canSell = false
        }

        const checkLockRoute = routeSetting.lockRoute.find(
          item => item.id === route.id
        )
        const lockRoute = checkLockRoute.lock
        const listStore = filteredListStore.map(item => {
          const lockStore = checkLockRoute.listStore.find(
            u => u.storeId === item.storeInfo.storeId
          ).lock

          return {
            storeInfo: {
              _id: item.storeInfo._id,
              storeId: item.storeInfo.storeId,
              name: item.storeInfo.name,
              taxId: item.storeInfo.taxId,
              tel: item.storeInfo.tel,
              typeName: item.storeInfo.typeName,
              address: item.storeInfo.address
            },
            lockStore: lockStore,
            note: item.note,
            image: item.image,
            latitude: item.latitude,
            longtitude: item.longtitude,
            status: item.status,
            statusText: item.statusText,
            date: item.date,
            listOrder: item.listOrder,
            _id: item._id,
            storeType: item.storeType
          }
        })

        return {
          ...route.toObject(),
          lockRoute: lockRoute,
          canSell,
          dateMacth: dateMacth.date,
          thaiDate,
          listStore: listStore
        }
      })
      .filter(route => route.listStore.length > 0)

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

        // const dateMacth = dates.find(
        //   u => String(u.day) === String(route.day)
        // )

        // if (dateMacth.length === 0){
        //   continue
        // }

        // const thaiDate = new Intl.DateTimeFormat('en-CA', {
        //   timeZone: 'Asia/Bangkok',
        //   year: 'numeric',
        //   month: '2-digit',
        //   day: '2-digit'
        // }).format(new Date())

        // if (dateMacth.date === thaiDate) {
        //   canSell = true
        // } else {
        //   canSell = false
        // }

        const storeInfo = item.storeInfo?.toObject
          ? item.storeInfo.toObject()
          : item.storeInfo || {}

        const type = storeTypeMap.get(storeInfo.storeId)
        // console.log(item)
        return {
          ...item,
          // canSell || false,
          // storeInfo,
          storeType: type || []
        }
      })

      return {
        ...route,
        listStore: enrichedListStore
      }
    })

    // console.log(enrichedRoutes)

    // If area is not provided (or explicitly empty), group results by day+period
    if ((!area || area === '') && period && !storeId) {
      const groups = new Map()
      ;(enrichedRoutes || []).forEach(route => {
        // Skip routes with area == 'IT211'
        if (route.area === 'IT211') return

        // derive zone/team from route (prefer explicit fields, otherwise from area)
        let zoneKey = route.zone || ''
        let teamKey = route.team || ''
        if (route.area) {
          const a = String(route.area || '')
          zoneKey = a.substring(0, 2)
          teamKey = `${a.substring(0, 2)}${a.charAt(3) || ''}`
        }

        // if request includes zone/team filters, skip non-matching routes
        if (zone && String(zone) !== zoneKey) return
        if (team && String(team) !== teamKey) return

        const dayKey = route.day || ''
        if (!groups.has(dayKey)) {
          groups.set(dayKey, {
            day: dayKey,
            period: period,
            // routes: [],
            storeAll: 0,
            storePending: 0,
            storeSell: 0,
            storeNotSell: 0,
            storeCheckInNotSell: 0,
            storeTotal: 0
          })
        }

        const grp = groups.get(dayKey)

        // accumulate counts from each route (use numeric defaults)
        const ra = Number(route.storeAll) || 0
        const rp = Number(route.storePending) || 0
        const rs = Number(route.storeSell) || 0
        const rn = Number(route.storeNotSell) || 0
        const rcn = Number(route.storeCheckInNotSell) || 0
        const rt = Number(route.storeTotal) || 0

        grp.storeAll += ra
        grp.storePending += rp
        grp.storeSell += rs
        grp.storeNotSell += rn
        grp.storeCheckInNotSell += rcn
        grp.storeTotal += rt
      })

      // finalize percentage fields for each group
      enrichedRoutes = Array.from(groups.values()).map(g => {
        const storeAll = g.storeAll || 0
        const storeTotal = g.storeTotal || 0
        const storeSell = g.storeSell || 0

        const percentVisit = storeAll
          ? parseFloat(((storeTotal / storeAll) * 100).toFixed(2))
          : 0
        const percentEffective = storeAll
          ? parseFloat(((storeSell / storeAll) * 100).toFixed(2))
          : 0
        const complete = percentVisit
        const percentComplete = storeAll
          ? parseFloat((((storeTotal / storeAll) * 100 * 360) / 100).toFixed(2))
          : 0

        return {
          day: g.day,
          period: g.period,
          routes: g.routes,
          storeAll: g.storeAll,
          storePending: g.storePending,
          storeSell: g.storeSell,
          storeNotSell: g.storeNotSell,
          storeCheckInNotSell: g.storeCheckInNotSell,
          storeTotal: g.storeTotal,
          percentComplete,
          complete,
          percentVisit,
          percentEffective
        }
      })
    }

    if (area && period && !routeId && !storeId && !province) {
      enrichedRoutes = (enrichedRoutes || []).map(item => {
        return {
          ...item,
          listStore: []
        }
      })
    }

    res.status(200).json({
      status: 200,
      message: 'Success',
      data: enrichedRoutes,
      saleOutRoute: routeSetting.saleOutRoute
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ status: 500, message: err.message })
  }
}

exports.editLockRoute = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { period, area, id, storeId, lock, editType, startDate, user } =
      req.body
    const { RouteSetting, RouteSettingLog } = getModelsByChannel(
      channel,
      res,
      routeModel
    )

    // =========================
    // 1. Validate base
    // =========================
    if (!period) {
      return res.status(400).json({
        status: 400,
        message: 'not found period'
      })
    }

    const routeSettingData = await RouteSetting.findOne({ period })
    if (!routeSettingData) {
      return res.status(404).json({
        status: 404,
        message: 'RouteSetting not found'
      })
    }

    // =========================
    // 2. Switch by editType
    // =========================
    let exists = {}
    const query = { period }
    let result
    let routeSettingLog = {}
    switch (editType) {
      case 'area':
        if (!area) {
          return res.status(400).json({
            status: 400,
            message: 'not found area'
          })
        }

        exists = await RouteSetting.findOne({ period, area })

        if (!exists) {
          return res.status(404).json({
            status: 404,
            message: 'area not found (nothing to update)'
          })
        }

        result = await RouteSetting.updateOne(
          { period, area },
          {
            $set: {
              lock: lock,
              'lockRoute.$[].lock': lock,
              'lockRoute.$[].listStore.$[].lock': lock
            }
          }
        )

        routeSettingLog = {
          period: period,
          area: area,
          lock: lock,
          editType: editType,
          user: user
        }

        break

      case 'id':
        if (!period || !area || !id) {
          return res.status(400).json({
            status: 400,
            message: 'not found period, area, id'
          })
        }
        exists = await RouteSetting.findOne({
          period,
          area,
          lockRoute: {
            $elemMatch: {
              id
            }
          }
        })

        if (!exists) {
          return res.status(404).json({
            status: 404,
            message: 'route not found (nothing to update)'
          })
        }

        result = await RouteSetting.updateOne(
          { period, area },
          {
            $set: {
              'lockRoute.$[route].lock': lock,
              'lockRoute.$[route].listStore.$[].lock': lock
            }
          },
          {
            arrayFilters: [{ 'route.id': id }]
          }
        )

        routeSettingLog = {
          period: period,
          area: area,
          id: id,
          lock: lock,
          editType: editType,
          user: user
        }

        break

      case 'store':
        if (!area || !id || !storeId) {
          return res.status(400).json({
            status: 400,
            message: 'not found area, id, storeId'
          })
        }

        exists = await RouteSetting.findOne({
          period,
          area,
          lockRoute: {
            $elemMatch: {
              id,
              listStore: {
                $elemMatch: {
                  storeId
                }
              }
            }
          }
        }).lean()

        if (!exists) {
          return res.status(404).json({
            status: 404,
            message: 'route or store not found (nothing to update)'
          })
        }

        result = await RouteSetting.updateOne(
          { period, area },
          {
            $set: {
              'lockRoute.$[route].listStore.$[store].lock': lock
            }
          },
          {
            arrayFilters: [{ 'route.id': id }, { 'store.storeId': storeId }]
          }
        )

        routeSettingLog = {
          period: period,
          area: area,
          id: id,
          storeId: storeId,
          lock: lock,
          editType: editType,
          user: user
        }

        break

      case 'startDate':
        if (!startDate) {
          return res.status(400).json({
            status: 400,
            message: 'not found startDate'
          })
        }

        if (area) query.area = area

        result = await RouteSetting.updateMany(query, { $set: { startDate } })

        routeSettingLog = {
          period: period,
          area: area ?? 'all',
          startDate: startDate,
          editType: editType,
          user: user
        }

        break

      case 'saleOutRoute':
        if (area) query.area = area

        result = await RouteSetting.updateMany(query, {
          $set: { saleOutRoute: lock }
        })

        routeSettingLog = {
          period: period,
          area: area ?? 'all',
          editType: editType,
          user: user
        }

        break

      default:
        return res.status(400).json({
          status: 400,
          message: `invalid editType: ${editType}`
        })
    }

    await RouteSettingLog.create(routeSettingLog)

    const io = getSocket()
    io.emit('route/editLockRoute', {
      status: 200,
      message: 'editLockRoute success',
      area: area,
      period: period,
      editType: editType,
      lock: lock,
      updatedAt: Date.now()
    })

    // =========================
    // 3. Success
    // =========================
    return res.status(200).json({
      status: 200,
      message: 'editLockRoute success'
    })
  } catch (error) {
    console.error('[editLockRoute]', error)
    return res.status(500).json({
      status: 500,
      message: error.message
    })
  }
}

exports.getRouteSetting = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { period, area } = req.query
    const { Route, RouteSetting } = getModelsByChannel(channel, res, routeModel)

    let query = { period }

    if (area) {
      query.area = area
    }

    const routeSettingData = await RouteSetting.find(query)

    res.status(200).json({
      status: 200,
      message: 'getRouteSetting',
      data: routeSettingData
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: 500, message: error.message })
  }
}

exports.autoLockRouteChange = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { period } = req.body
    const { Route, RouteSetting } = getModelsByChannel(channel, res, routeModel)

    const routeSettingData = await RouteSetting.find({ period: period })

    for (const route of routeSettingData) {
      const dates = generateDates(route.startDate, 24)
      const thaiDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date())

      for (const item of route.lockRoute) {
        const dateMacth = dates.find(u => String(u.day) === String(item.route))
        let canSell = ''
        if (dateMacth.date === thaiDate) {
          canSell = true
        } else {
          canSell = false
        }

        const result = await RouteSetting.updateOne(
          { period, area: route.area },
          {
            $set: {
              'lockRoute.$[route].lock': canSell,
              'lockRoute.$[route].listStore.$[].lock': canSell
            }
          },
          {
            arrayFilters: [{ 'route.id': item.id }]
          }
        )
      }
    }

    res.status(200).json({
      status: 200,
      message: 'getRouteSetting',
      data: routeSettingData
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: 500, message: error.message })
  }
}

exports.getSaleOutRoute = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { area, period } = req.query
    const { Route, RouteSetting } = getModelsByChannel(channel, res, routeModel)

    const routeSettingData = await RouteSetting.findOne({
      period: period,
      area: area
    })

    res.status(200).json({
      status: 200,
      message: 'getsaleOutRoute',
      saleOutRoute: routeSettingData.saleOutRoute
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: 500, message: error.message })
  }
}

exports.getCurrentRouteLock = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { area, period } = req.query
    const { Route, RouteSetting } = getModelsByChannel(channel, res, routeModel)

    const RouteSettingData = await RouteSetting.findOne({
      area: area,
      period: period
    })

    if (!RouteSettingData) {
      return res.status(404).json({
        status: 200,
        message: 'Not found RouteSetting'
      })
    }

    const thaiDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date())
    const dates = generateDates(RouteSettingData.startDate, 24)

    const dateMacth = dates.find(u => String(u.date) === String(thaiDate))

    res.status(200).json({
      status: 200,
      message: 'getCurrentRouteLock',
      data: `R${dateMacth.day}`
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: 500, message: error.message })
  }
}
exports.updateSaleOutRoute = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    // const {} = req.query
    const { saleOutRoute, area, period } = req.body

    if (!area || !period) {
      return res.status(400).json({
        status: 400,
        message: 'area and period are required'
      })
    }

    if (typeof saleOutRoute !== 'boolean') {
      return res.status(400).json({
        status: 400,
        message: 'saleOutRoute must be boolean'
      })
    }

    const { RouteSetting } = getModelsByChannel(channel, res, routeModel)

    const updated = await RouteSetting.findOneAndUpdate(
      { area, period },
      { $set: { saleOutRoute } },
      { new: true }
    )

    if (!updated) {
      return res.status(404).json({
        status: 404,
        message: 'RouteSetting not found'
      })
    }

    // 🔔 emit socket
    const io = getSocket()
    io.emit('route/updateSaleOutRoute', {
      area,
      period,
      saleOutRoute,
      updatedAt: Date.now()
    })

    res.status(200).json({
      status: 200,
      message: 'updateSaleOutRoute success',
      saleOutRoute: updated.saleOutRoute
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({
      status: 500,
      message: error.message
    })
  }
}
