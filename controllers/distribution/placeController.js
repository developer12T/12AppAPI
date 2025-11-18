const { find, each, forEach } = require('lodash')
// const { Place,  Withdraw } = require('../../models/cash/distribution')
// const { User } = require('../../models/cash/user')
const { sequelize, DataTypes } = require('../../config/m3db')
const { getSocket } = require('../../socket')
const userModel = require('../../models/cash/user')
const distributionModel = require('../../models/cash/distribution')
const { getModelsByChannel } = require('../../middleware/channel')
const { wereHouseQuery } = require('../../controllers/queryFromM3/querySctipt')
const {
  period,
  previousPeriod,
  toThaiTime,
  formatDate,
  formatDateToYYYYMMDD
} = require('../../utilities/datetime')
const { CIADDR,DROUTE } = require('../../models/cash/master')



exports.getPlace = async (req, res) => {
  try {
    const { area, type } = req.query

    const channel = req.headers['x-channel']
    // console.log(channel)

    const { Place } = getModelsByChannel(channel, res, distributionModel)

    if (!area) {
      return res.status(400).json({ status: 400, message: 'area is required!' })
    }

    let place = await Place.findOne({ area }, { _id: 0, __v: 0 }).lean()

    if (!place) {
      return res.status(404).json({ status: 404, message: 'Place not found!' })
    }

    // console.log(place.listAddress)
    if (type) {
      place.listAddress = place.listAddress.filter(
        address => address.type === type
      )
    }

    // const io = getSocket()
    // io.emit('distribution/place/get', {});

    res.status(200).json({
      status: '200',
      message: 'Successfully!',
      data: place.listAddress.length ? place : null
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.addPlace = async (req, res) => {
  // const session = await require('mongoose').startSession();
  // session.startTransaction();
  try {
    const { area, listAddress } = req.body

    const channel = req.headers['x-channel']
    const { Place } = getModelsByChannel(channel, res, distributionModel)

    if (!area || !listAddress) {
      // await session.abortTransaction();
      // session.endSession();
      return res
        .status(400)
        .json({ status: 400, message: 'area and listAddress are required!' })
    }

    let place = await Place.findOne({ area: area })
    // .session(session);
    if (!place) {
      place = await Place.create([
        {
          area,
          listAddress
        }
      ])
      place = place[0] // create แบบ array
    } else {
      const existingIds = new Set(place.listAddress.map(addr => addr.id))
      const newAddresses = listAddress.filter(addr => !existingIds.has(addr.id))
      if (newAddresses.length > 0) {
        place.listAddress.push(...newAddresses)
        await place.save()
      }
    }

    // await session.commitTransaction();
    // session.endSession();

    const io = getSocket()
    io.emit('distribution/place/add', {})

    res.status(200).json({
      status: '200',
      message: 'Place added successfully!',
      data: place
    })
  } catch (error) {
    // await session.abortTransaction().catch(() => { });
    // session.endSession();
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getType = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { Place } = getModelsByChannel(channel, res, distributionModel)

    const places = await Place.find(
      { area: { $not: /PC|EV/i } }, // i = case-insensitive
      { listAddress: 1 }
    ).lean();
    // console.log(places)
    if (!places.length) {
      return res.status(404).json({
        status: '404',
        message: 'No places found!'
      })
    }

    let allAddresses = places.flatMap(place => place.listAddress)
    let uniqueTypes = []
    let typeSet = new Set()

    for (const address of allAddresses) {
      const typeKey = `${address.type}-${address.typeNameTH}-${address.typeNameEN}`
      if (!typeSet.has(typeKey)) {
        typeSet.add(typeKey)
        // console.log(address)
        if (address.type && address.typeNameTH && address.typeNameEN) {
          uniqueTypes.push({
            type: address.type,
            typeNameTH: address.typeNameTH,
            typeNameEN: address.typeNameEN
          })
        }
      }
    }

    // const io = getSocket()
    // io.emit('distribution/getType', {});

    res.status(200).json({
      status: '200',
      message: 'Type list fetched successfully!',
      data: uniqueTypes
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.addAllPlace = async (req, res) => {
  // const session = await require('mongoose').startSession();
  // session.startTransaction();
  try {
    const channel = req.headers['x-channel']
    const { User } = getModelsByChannel(channel, res, userModel)
    const { Place, Withdraw } = getModelsByChannel(
      channel,
      res,
      distributionModel
    )

    const users = await User.find({ role: 'sale' })
    // .session(session)

    areaList = users.map(user => user.area)

    let data = []

    areaAdded = []
    // console.log("areaList", areaList)
    for (const user of areaList) {
      const withdrawT04 =
        (await Withdraw.find({ Des_Area: user, ZType: 'T04' })) || []
      const withdrawT05 =
        (await Withdraw.find({ Des_Area: user, ZType: 'T05' })) || []
      const checkPlace = await Place.findOne({ area: user })

      if (!checkPlace) {
        const listAddress = []

        // วน T04
        for (const i of withdrawT04) {
          listAddress.push({
            type: 'T04',
            typeNameTH: i.Des_Name,
            typeNameEN: 'pickup',
            shippingId: i.Des_Area,
            route: i.ROUTE,
            name: '',
            address: '',
            district: '',
            subDistrict: '',
            province: '',
            postcode: '',
            tel: '',
            warehouse: {
              normal: i.WH,
              clearance: i.WH1
            }
          })
        }

        // วน T05
        for (const i of withdrawT05) {
          listAddress.push({
            type: 'T05',
            typeNameTH: 'ส่งสินค้า',
            typeNameEN: 'delivery',
            shippingId: i.Des_No,
            route: i.Des_Area,
            name: i.Des_Name,
            address: '',
            district: '',
            subDistrict: '',
            province: '',
            postcode: '',
            tel: '',
            warehouse: {
              normal: i.WH,
              clearance: i.WH1
            }
          })
        }

        // รวมข้อมูล
        const combineData = {
          area: user,
          listAddress
        }
        data.push(combineData)
        areaAdded.push(combineData.area)
        const placeDoc = new Place(combineData)
        await placeDoc.save()
      }
    }

    // await session.commitTransaction();
    // session.endSession();

    const io = getSocket()
    io.emit('distribution/place/addAllPlace', {})

    res.status(200).json({
      status: 200,
      message: `add place ${areaAdded} fetched successfully!`,
      data: data
    })
  } catch (error) {
    // await session.abortTransaction().catch(() => { });
    // session.endSession();
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.addWereHouse = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const dataWereHouseTable = await wereHouseQuery() // ควรคืนค่าที่เป็น Array
    // console.log(dataWereHouseTable)

    const { WereHouse } = getModelsByChannel(channel, res, distributionModel)

    await WereHouse.deleteMany()

    if (Array.isArray(dataWereHouseTable) && dataWereHouseTable.length > 0) {
      await WereHouse.insertMany(dataWereHouseTable)
    }

    res.status(200).json({
      status: '200',
      message: 'Successfully added warehouse data',
      count: dataWereHouseTable.length
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getWareHouse = async (req, res) => {
  try {
    const channel = req.headers['x-channel']

    const { WereHouse } = getModelsByChannel(channel, res, distributionModel)

    const data = await WereHouse.find().select('wh_code wh_name -_id')

    res.status(200).json({
      status: '200',
      message: 'Successfully get warehouse data',
      data: data
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getRouteWithdraw = async (req, res) => {
  try {
    const { WH, Des_Area } = req.query
    const channel = req.headers['x-channel']

    const { Withdraw } = getModelsByChannel(channel, res, distributionModel)

    let query = {}
    if (WH) query.WH = WH
    query.Des_Area = { $regex: `^P`, $options: 'i' }

    const data = await Withdraw.find(query)

    res.status(200).json({
      status: '200',
      message: 'Successfully get Withdraw data',
      data: data
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.syncAddressCIADDR = async (req, res) => {
  let t;   // 🟦 ประกาศไว้ด้านบนก่อน

  try {
    const channel = req.headers['x-channel']
    const { Withdraw } = getModelsByChannel(channel, res, distributionModel)

    t = await CIADDR.sequelize.transaction();   // 🟦 กำหนดค่าใน try

    const CIADDRdata = await CIADDR.findAll()
    const idList = [...new Set(
      CIADDRdata.map(item => item.OAADK1?.trim())
    )];
    const withdrawData = await Withdraw.find()

    let data = []

    for (const row of withdrawData) {

      if (!idList.includes(row.Des_No)) {

        if (row.Des_Name.length > 36) {
          OACONM = row.Des_Name.slice(0, 36);
          OAADR1 = row.Des_Name.slice(36);
        } else {
          OACONM = row.Des_Name;
          OAADR1 = "";
        }



        const dataTran = {
          coNo: 410,
          OAADTH: 4,
          OAADK1: row.Des_No,
          OAADK2: '',
          OAADK3: '',
          OACONM: OACONM,
          OAADR1: OAADR1,
          OAADR2: '',
          OAADR3: row.WH,
          OAADR4: '',
          OACSCD: 'TH',
          OAPONO: row.ROUTE,
          // OAADVI: '',
          // OAGEOC: 0,
          // OATAXC: '',
          // OAECAR: '',
          // OATOWN: '',
          // OAPNOD: '',
          // OATXID: '',
          OARGDT: row.Des_Date,
          // OARGTM: '',
          OALMDT: formatDate(),
          // OACHNO: '',
          // OACHID: 'MI02',
          OALMTS: `${Date.now()}`,
          // OAGEOX: '',
          // OAGEOY: '',
          // OAGEOZ: '',
          // OACUEX: ''
        }

        data.push(dataTran)

        await CIADDR.create(dataTran, { transaction: t })  // 🟩 ผูกกับ transaction
      }
    }

    await t.commit()   // 🟩 commit

    res.status(201).json({
      status: 201,
      message: 'syncAddressCIADDR Success',
      data: data,
      // data : idList
    })

  } catch (error) {
    console.log("SQL ERROR =", error.original || error.parent || error);
    if (t) await t.rollback();
    res.status(500).json({ status: '500', message: error.message });
  }
}

exports.syncAddressDROUTE = async (req, res) => {
  let t;
  try {

    const channel = req.headers['x-channel']
    const { Withdraw } = getModelsByChannel(channel, res, distributionModel)

    t = await DROUTE.sequelize.transaction();   // 🟦 กำหนดค่าใน try

    const DROUTEdata = await DROUTE.findAll()

    res.status(200).json({
      status:200,
      message:'syncAddressDROUTE Success',
      data : DROUTEdata
    })


  } catch (error) {
    console.log("SQL ERROR =", error.original || error.parent || error);
    if (t) await t.rollback();
    res.status(500).json({ status: '500', message: error.message });
  }
}