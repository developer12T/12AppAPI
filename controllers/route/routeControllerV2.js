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


// exports.