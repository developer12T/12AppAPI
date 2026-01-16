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
      message: 'updateAreaByDataRoute',
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

    const routeLockExit = await RouteSetting.find({period:period}).select("area")
    const areaExitList = routeLockExit.flatMap(item => item.area)

    const userData = await User.find({ role: "sale", platformType: 'CASH' ,area:{$nin:areaExitList}})

    const routeData = await Route.find({ period: period })
    const storeIdObj = [...new Set(routeData.flatMap(item =>
      item.listStore.map(u => u.storeInfo)
    ))]
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
            storeInfo : storeDetail._id,
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
        lockRoute: lockRoute,
      }
      areaList.push(user.area)
      await RouteSetting.create(dataTran)
    }





    res.status(200).json({
      status: 201,
      message: `add to ${areaList} ${period} addRouteSettings success `,
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