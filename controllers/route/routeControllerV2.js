// const { query } = require('express')
const axios = require('axios')
const { Route, RouteChangeLog } = require('../../models/cash/route')
const {
  period,
  periodNew,
  previousPeriod,
  generateDates,
  toThaiTime,
  rangeDate,
  formatThaiSQL,
  toThaiDateOrDefault
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
  getDataRoute,
  getRouteCreditArea,
  getStoreDetailCredit
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
const fs = require('fs')
const os = require('os')
const moment = require('moment')
const { flatMap } = require('lodash')
const { WithdrawCash, ROUTE_DETAIL,
  ROUTE_STORE,
  ROUTE_ORDER } = require('../../models/cash/powerBi')
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

      if (routeUser.length === 0) {
        continue
      }

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

    const storeData = await Store.findOne({ storeId: storeId })

    let routeSetting = []


    routeSetting = await RouteSetting.findOne({ period: period, area: storeData?.area ?? area })

    dates = generateDates(routeSetting.startDate, 26)


    // console.log("routeSetting",routeSetting)

    const query = { period }
    query.area = storeData?.area ?? area
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
        ; (enrichedRoutes || []).forEach(route => {
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
      routeID: id,
      period: period,
      storeId: storeId,
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
      const dates = generateDates(route.startDate, 26)
      const thaiDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date())

      for (const item of route.lockRoute) {
        const dateMacth = dates.find(u => String(u.day) === String(item.route))
        let canSell = ''

        if (!dateMacth || !dateMacth.date) {
          continue
        }

        if (dateMacth.date === thaiDate) {
          canSell = false
        } else {
          canSell = true
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

    if (!routeSettingData) {
      return res.status(404).json({
        status: 404,
        message: "not found routeSettingData"
      })
    }

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
    const dates = generateDates(RouteSettingData.startDate, 26)

    const dateMacth = dates.find(u => String(u.date) === String(thaiDate))
    // console.log('dateMacth',dateMacth)
    if (!dateMacth) {
      return res.status(404).json({
        status: 404,
        message: 'Not found dateMacth'
      })
    }

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



exports.getStoreCheckinByDayAreaCredit = async (req, res) => {
  try {
    const { area, date } = req.body
    const channel = req.headers['x-channel']
    const { Route } = getModelsByChannel(channel, res, routeModel)

    const period = `${date.slice(6, 10)}${date.slice(3, 5)}`

    if (!area || !date) {
      return res.status(400).json({
        status: 400,
        message: 'area and date are required'
      })
    }

    const dataCredit = await getRouteCreditArea(date, area, 'date')
    const storeList = dataCredit.flatMap(item => item.cus_code)
    const storeUnique = [...new Set(storeList)]
    const storeDetail = await getStoreDetailCredit(storeUnique)
    data = dataCredit.map(item => {

      const storeData = storeDetail.find(u =>
        String(u.storeId).trim() === String(item.cus_code).trim()
      )

      let status = ''
      let statusText = ''
      if (!item.cono || item.cono === '-' || item.cono === '') {
        status = '2'
        statusText = 'ไม่ซิ้อ'
      } else {
        status = '3'
        statusText = 'ซิ้อ'
      }

      return {
        routeDay: item.route.padStart(2, '0'),
        period: period,
        area: item.area,
        zone: item.area.slice(0, 3),
        storeId: item.cus_code,
        storeName: storeData?.storeName ?? '',
        storeAddress: storeData?.storeAddress ?? '',
        phone: storeData?.phone ?? '',
        status: status,
        statusText: statusText,
        orderId: item.cono,
        sum: item.price,
        mapLink: `https://maps.google.com/?q=${item.latitude},${item.longitude}`,
        imageLink: '',
        checkinDatetime: item.check_in
      }
    })



    res.status(200).json({
      status: 200,
      message: 'success',
      data: data
    })
  } catch (error) {
    console.error('❌ Error:', error)
    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message
    })
  }
}


exports.polylineRouteCredit = async (req, res) => {
  try {
    const { area, period, startDate, endDate } = req.query
    let dataCredit = []
    if (startDate, endDate) {

      dataCredit = await getRouteCreditArea('', area, 'start', startDate, endDate)
    } else {

      dataCredit = await getRouteCreditArea('', area, 'period', '', '', period)
    }



    const storeList = dataCredit.flatMap(item => item.cus_code)
    const storeUnique = [...new Set(storeList)]
    const storeDetail = await getStoreDetailCredit(storeUnique)

    if (dataCredit.length === 0) {
      return res.status(404).json({
        status: 404,
        message: 'not found dataCredit',
      })
    }

    const data = dataCredit.map(item => {
      let status = ''
      let statusText = ''
      if (!item.cono || item.cono === '-' || item.cono === '') {
        status = '2'
        statusText = 'ไม่ซิ้อ'
      } else {
        status = '3'
        statusText = 'ซิ้อ'
      }

      const storeData = storeDetail.find(u =>
        String(u.storeId).trim() === String(item.cus_code).trim()
      )

      return {
        storeId: item.cus_code,
        storeName: storeData.storeName,
        route: item.route.padStart(2, '0'),
        statusText: statusText,
        status: status,
        image: '',
        note: item.comment_,
        date: toThaiTime(item.check_in),
        location: [
          Number(item.longitude),
          Number(item.latitude)

        ]
      }
    })



    res.status(200).json({
      status: 200,
      message: 'success',
      data: data
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: 500, message: 'Internal server error' })
  }
}

exports.getRouteEffectiveByDayAreaCredit = async (req, res) => {
  try {
    const { area, zone, team, period } = req.body

    const { startDate, endDate } = rangeDate(period)

    const dataCredit = await getRouteCreditArea('', area, 'period', '', '', period)

    const listDate = [...new Set(dataCredit.flatMap(item => item.check_in_date))]

    let data = []

    let totalStoreCheckIn = 0
    let totalStoreSell = 0
    let totalStoreVisit = 0
    let totalStoreNotSell = 0
    let totalStorePending = 0

    for (const row of listDate) {

      let storeCheckIn = 0
      let storeSell = 0
      let storeVisit = 0
      let storeNotSell = 0
      let storePending = 0
      const groupDate = dataCredit.filter(item => item.check_in_date === row)

      for (const item of groupDate) {
        let status = 0
        let statusText = 0
        if (!item.cono || item.cono === '-' || item.cono === '') {
          status = '2'
          statusText = 'ไม่ซิ้อ'
        } else {
          status = '3'
          statusText = 'ซิ้อ'
        }

        if (status === '3') storeSell++, totalStoreSell++
        if (status === '2') storeNotSell++, totalStoreNotSell++
        totalStoreCheckIn++
        totalStoreVisit++
        storeCheckIn++
        storeVisit++

      }
      const dataTran = {
        storeCheckIn: storeCheckIn,
        storeSell: storeSell,
        storeVisit: storeVisit,
        storeNotSell: storeNotSell,
        storePending: storePending,
        day: row,
        period: period,
        area: area
      }

      data.push(dataTran)

    }

    const total = {
      day: 'Total',
      period: period,
      area: area,
      storeCheckIn: totalStoreCheckIn,
      storeSell: totalStoreSell,
      storeVisit: totalStoreVisit,
      storeNotSell: totalStoreNotSell,
      storePending: totalStorePending,

    }



    res.status(200).json({
      status: 200,
      message: 'getRouteEffectiveByDayAreaCredit',
      data: data,
      total
    })


  } catch (error) {
    console.error(error)
    res.status(500).json({ status: 500, message: 'Internal server error' })
  }
}

exports.delStoreOneInRoute = async (req, res) => {
  try {
    const { storeId, routeId } = req.body
    const channel = req.headers['x-channel']
    const { Route, RouteSetting } = getModelsByChannel(channel, res, routeModel)
    const { Store } = getModelsByChannel(channel, res, storeModel)

    const routeData = await Route.findOne({ id: routeId })

    if (!routeData) {
      return res.status(404).json({
        status: 404,
        message: 'Not found route'
      })
    }

    const storeListOBJ = routeData.listStore.flatMap(item => item.storeInfo)
    const storeInRoute = await Store.find({
      _id: { $in: storeListOBJ }
    }).select('storeId')
    const storeIdSet = storeInRoute.map(item => item.storeId)

    if (!storeIdSet.includes(storeId)) {
      return res.status(409).json({
        status: 409,
        message: 'Not found store in route'
      })
    }
    const routeSetting = await RouteSetting.findOne(
      {
        period: routeData.period,
        area: routeData.area,
        "lockRoute.listStore.storeId": storeId
      }
    )
    if (!routeSetting) {
      return res.status(404).json({
        status: 404,
        message: 'Not found routeSetting'
      })
    }



    res.status(200).json({
      status: 200,
      message: 'success',
      data: storeIdSet
    })
  } catch (error) {
    console.error('❌ Error:', error)
    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message
    })
  }
}

exports.addRouteToM3DBPRD_BK = async (req, res) => {
  try {
    const { period } = req.body
    const channel = req.headers['x-channel']
    const { Route, RouteSetting } = getModelsByChannel(channel, res, routeModel)
    const { Store } = getModelsByChannel(channel, res, storeModel)
    const { Order } = getModelsByChannel(channel, res, orderModel)

    const routeData = await Route.find({ period: period, area: 'BK225' })
    const storeObj = [...new Set(routeData.flatMap(item => item.listStore.flatMap(row => row.storeInfo)))]

    const orderData = await Order.find({
      period: period, routeId: { $nin: '' },
      status: { $in: ['pending', 'completed'] }
    })


    const storeData = await Store.find({
      _id: {
        $in: storeObj
      }
    }).select('_id storeId name')


    let routeList = []
    let storeList = []
    let orderList = []

    const routeBulk = routeData.map(row => {

      return {
        ROUTE_ID: row.id,
        PERIOD: row.period,
        AREA: row.area,
        ZONE: row.zone,
        TEAM: row.team,
        DAY: row.day
      }
    })

    // await ROUTE_DETAIL.bulkCreate(routeBulk)

    const storeBulk = routeData.flatMap(row => row.listStore.map(item => {

      const storeExit = storeData.find(u => String(u._id) === item.storeInfo)


      const value = toThaiDateOrDefault(item?.date)

      console.log('CHECKIN TYPE:', typeof value)
      console.log('CHECKIN VALUE:', value)


      return {
        ROUTE_ID: row.id,
        STORE_ID: storeExit?.storeId || '',
        // storeInfo: item.storeInfo,
        STORE_NAME: storeExit?.name || '',
        NOTE: item?.note || '',
        // image: item.image,
        LATITUDE: Number(item.latitude),
        LONGITUDE: Number(item.longtitude),
        STATUS: item.status,
        STATUS_TEXT: item.statusText,
        CHECKIN: toThaiDateOrDefault(item?.date)
      }
    }))

    await ROUTE_STORE.bulkCreate(storeBulk)



    // for (const row of routeData) {

    //   const dataRoute = {
    //     ROUTE_ID: row.id,
    //     PERIOD: row.period,
    //     AREA: row.area,
    //     ZONE: row.zone,
    //     TEAM: row.team,
    //     DAY: row.day

    //   }

    //   await ROUTE_DETAIL.create(dataRoute)

    //   // console.log(dataRoute)

    //   routeList.push(dataRoute)



    //   for (const item of row.listStore) {

    //     const storeExit = storeData.find(u => String(u._id) === item.storeInfo)

    //     const dataStore = {
    //       routeId: row.id,
    //       storeId: storeExit?.storeId | '',
    //       // storeInfo: item.storeInfo,
    //       storeName: storeExit?.name | '',
    //       note: item?.note | '',
    //       image: item.image,
    //       latitude: item.latitude,
    //       longtitude: item.longtitude,
    //       status: item.status,
    //       statusText: item.statusText,
    //       dateCheckin: item.date

    //     }

    //     storeList.push(dataStore)
    //     for (const order of item.listOrder) {


    //       const orderDetail = orderData.find(m => m.orderId === order.orderId)

    //       if (!orderDetail) {
    //         continue
    //       }

    //       const dataOrder = {
    //         routeId: row.id,
    //         storeId: orderDetail.store.storeId,
    //         storeName: orderDetail.store.name,
    //         area: orderDetail.store.area,
    //         zone: orderDetail.store.zone,
    //         province: orderDetail.shipping.province,
    //         latitude: orderDetail.latitude,
    //         longitude: orderDetail.longitude,
    //         saleName: orderDetail.sale.name,
    //         warehouse: orderDetail.sale.warehouse,
    //         total: orderDetail.total,
    //         createdAt: formatDateTimeToThai(orderDetail.createdAt)
    //       }


    //       orderList.push(dataOrder)
    //     }

    //   }

    // }


    res.status(201).json({
      status: 201,
      message: 'addRouteToM3DBPRD_BK',
      data: storeBulk
      // data: storeList
      // data: orderData
    })



  } catch (error) {
    console.error('❌ Error:', error)
    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message
    })
  }
}