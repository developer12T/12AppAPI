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
const { CIADDR, DROUTE } = require('../../models/cash/master')
const { stat } = require('fs')
const { Op } = require('sequelize')
const XLSX = require('xlsx')

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
    const { Place } = getModelsByChannel('cash', res, distributionModel)

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
  try {
    const channel = req.headers['x-channel'];
    const { User } = getModelsByChannel('user', res, userModel);
    const { Place, Withdraw } = getModelsByChannel(channel, res, distributionModel);

    let type = channel === 'pc' ? 'PC' : 'cash';

    const users = await User.find({ role: 'sale', platformType: 'CASH' });
    const areaList = [...new Set(users.map(u => u.area).filter(Boolean))];

    let data = [];
    let areaAdded = [];
    let areaUpdated = [];

    for (const area of areaList) {
      const withdrawList = await Withdraw.find({ Des_Area: area });
      console.log(area)
      const listAddressNew = [];

      for (const i of withdrawList) {
        const isPickup = i.ZType === 'T04';

        listAddressNew.push({
          type: i.ZType,
          typeNameTH: isPickup ? i.Des_Name : 'ส่งสินค้า',
          typeNameEN: isPickup ? 'pickup' : 'delivery',
          shippingId: isPickup ? i.Des_Area : i.Des_No,
          route: isPickup ? i.ROUTE : i.Des_Area,
          name: isPickup ? '' : i.Des_Name,
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
        });
      }

      const place = await Place.findOne({ area });

      // ----------------------------------
      // 🔹 CREATE NEW
      // ----------------------------------
      if (!place) {
        const newData = { area, listAddress: listAddressNew };
        await Place.create(newData);
        data.push(newData);
        areaAdded.push(area);
      } else {
        // ----------------------------------
        // 🔸 UPDATE หรือ INSERT รายการใหม่
        // ----------------------------------
        const existingMap = new Map(
          place.listAddress.map(x => [
            `${x.type}-${x.shippingId}-${x.route}`,
            x
          ])
        );

        let updated = false;

        for (const item of listAddressNew) {
          const key = `${item.type}-${item.shippingId}-${item.route}`;
          const exist = existingMap.get(key);

          if (!exist) {
            // INSERT ใหม่
            place.listAddress.push(item);
            updated = true;
            areaUpdated.push(area);
            console.log(`🆕 INSERTED Place: ${area} -> ${key}`);
          } else {
            // UPDATE ถ้าค่ามีการเปลี่ยนแปลง
            const changed =
              exist.name !== item.name ||
              exist.typeNameTH !== item.typeNameTH ||
              exist.typeNameEN !== item.typeNameEN ||
              exist.warehouse.normal !== item.warehouse.normal ||
              exist.warehouse.clearance !== item.warehouse.clearance;

            if (changed) {
              Object.assign(exist, item);
              updated = true;
              areaUpdated.push(area);
              console.log(`🔄 UPDATED Place: ${area} -> ${key}`);
            }
          }
        }

        if (updated) {
          await place.save();
        }
      }
    }

    const io = getSocket();
    io.emit('distribution/place/addAllPlace', {});

    res.status(200).json({
      status: 200,
      message: `Added: ${areaAdded.length}, Updated: ${areaUpdated.length}`,
      addedArea: areaAdded,
      updatedArea: areaUpdated
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ status: '500', message: error.message });
  }
};



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
    if (Des_Area) query.Des_Area = Des_Area
    // query.Des_Area = { $regex: `^P`, $options: 'i' }

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
    const idList = [...new Set(
      DROUTEdata.map(item => item.routeCode?.trim())
    )];

    let data = []
    const withdrawData = await Withdraw.find({ ZType: 'T05' })

    const usedRouteCodes = new Set();
    const usedRouteCodesFromDB = new Set(
      idList.map(r => {
        const rr = r || '';
        const f6 = rr.slice(0, 6);
        const f5 = rr.slice(0, 5);
        return f6.includes('R') ? f5 + 'R' : f5;
      })
    );

    for (const row of withdrawData) {
      let routeCodeRaw = row.ROUTE || '';
      let routeCode = routeCodeRaw.slice(0, 6);

      const first6 = routeCode.slice(0, 6);
      const first5 = routeCode.slice(0, 5);

      // ปรับ format ให้เสร็จก่อน
      if (first6.includes('R')) {
        routeCode = first5;
      } else {
        routeCode = first5;
      }

      // เช็กซ้ำกับที่มีใน DB
      if (usedRouteCodesFromDB.has(routeCode)) {
        continue;
      }

      // เช็กซ้ำในรอบนี้
      if (usedRouteCodes.has(routeCode)) {
        continue;
      }

      const dataTran = {
        coNo: 410,
        DRRUTP: 5,
        routeCode,
        routeName: 'ส่งสินค้า',
        DRTX15: 'ส่งสินค้า',
        method: row.ZType,
        transection: '',
        DRLMDT: formatDate(),
        DRMODL: 'VOF'
      };

      usedRouteCodes.add(routeCode);
      data.push(dataTran);
      await DROUTE.create(dataTran, { transaction: t });
    }


    await t.commit()   // 🟩 commit

    res.status(200).json({
      status: 200,
      message: 'syncAddressDROUTE Success',
      data: data
    })


  } catch (error) {
    console.log("SQL ERROR =", error.original || error.parent || error);
    if (t) await t.rollback();
    res.status(500).json({ status: '500', message: error.message });
  }
}

exports.CiaddrAddToWithdraw = async (req, res) => {
  try {

    const { Withdraw } = getModelsByChannel('pc', res, distributionModel)
    const { User } = getModelsByChannel('user', res, userModel)

    const userData = await User.find({ role: "sale", platformType: 'PC' })
    // console.log(platformType)
    const area = userData.map(item => {
      return {
        area: item.area,
        warehouse: item.warehouse
      }
    })
    t = await CIADDR.sequelize.transaction();   // 🟦 กำหนดค่าใน try

    const CIADDRdata = await CIADDR.findAll({
      // where: {
      //   [Op.or]: [
      //     { OAADK1: { [Op.like]: `%PC%` } },
      //     { OAADK1: { [Op.like]: `%EV%` } }
      //   ]
      // }
    });


    const CIADDRroute = CIADDRdata.map(item => {
      const OAADK1Clean = item.OAADK1?.replace(/\s+/g, '') || ""
      const OAPONOClean = item.OAPONO?.replace(/\s+/g, '') || ""
      const werehouse = item.OAADK1.slice(2, 5)

      return {
        OAADK1: OAADK1Clean,
        OAPONO: OAPONOClean,
        werehouse: werehouse,
        name: item.OACONM,
        OAADR3: item.OAADR3
      }
    });

    const withdrawData = await Withdraw.find()
    const desList = withdrawData.flatMap(item => item.Des_No)
    const desSet = new Set(desList)
    let data = []

    const emailMap = {
      '109': 'dc_nr@onetwotrading.co.th',
      '101': 'dc_np2@onetwotrading.co.th',
      '102': 'dc_mk@onetwotrading.co.th',
      '104': 'dc_sr@onetwotrading.co.th',
      '105': 'dc_samutprakan@onetwotrading.co.th',
      '106': 'dc_nakhonsawan@onetwotrading.co.th',
      '103': 'dc_lp@onetwotrading.co.th',
      '111': 'dc_np2@onetwotrading.co.th',
      '121': '',
      '110': '',
    };

    for (const row of area) {
      const list = CIADDRroute.filter(item => item.werehouse === row.warehouse)

      for (const item of list) {

        if (desSet.has(item.OAADK1)) continue
        if (!item.OAADR3) continue

        const ZType = item.name?.includes('รับของเอง') ? 'T04' : 'T05'
        const Dc_Email = emailMap[item.OAADR3] ?? ''

        const dataTran = {
          Des_No: item.OAADK1,
          Des_Name: item.name,
          Des_Date: '20250101',
          ZType,
          Des_Area: row.area,
          WH: item.OAADR3,
          ROUTE: item.OAPONO,
          WH1: '',
          Dc_Email
        }

        // -----------------------
        // 🔥 Check ก่อน Insert
        // -----------------------
        const existing = await Withdraw.findOne({ Des_No: item.OAADK1 })

        if (existing) {
          // มีแล้ว → Update ให้เท่ากับข้อมูลใหม่
          await Withdraw.update(
            {
              Des_Name: item.name,
              WH: item.OAADR3,
              ROUTE: item.OAPONO,
              Dc_Email
            },
            { where: { Des_No: item.OAADK1 } }
          )
          console.log(`🔄 UPDATED: ${item.OAADK1}`)
        } else {
          // ไม่มี → Insert ใหม่
          await Withdraw.create(dataTran)
          console.log(`🆕 INSERTED: ${item.OAADK1}`)
          data.push(dataTran)
        }

        desSet.add(item.OAADK1)  // กันซ้ำในรอบถัดไป
      }
    }

    res.status(200).json({
      status: 200,
      message: 'add successful',
      data: data,
      // CIADDRroute: CIADDRroute
      // user: area
    })

  } catch (error) {
    console.log("SQL ERROR =", error.original || error.parent || error);
    if (t) await t.rollback();
    res.status(500).json({ status: '500', message: error.message });
  }
}

exports.updatePlaceAddressExcel = async (req, res) => {
  try {

    const { WH, Des_Area } = req.query
    const channel = req.headers['x-channel']

    const { Withdraw } = getModelsByChannel(channel, res, distributionModel)

    const emailMap = {
      '109': 'dc_nr@onetwotrading.co.th',
      '101': 'dc_np2@onetwotrading.co.th',
      '102': 'dc_mk@onetwotrading.co.th',
      '104': 'dc_sr@onetwotrading.co.th',
      '105': 'dc_samutprakan@onetwotrading.co.th',
      '106': 'dc_nakhonsawan@onetwotrading.co.th',
      '103': 'dc_lp@onetwotrading.co.th',
      '111': 'dc_np2@onetwotrading.co.th',
      '121': '',
      '110': '',
    };

    const file = req.file
    if (!file) {
      return res.status(400).json({ status: 400, message: 'No file uploaded' })
    }

    // ✅ เปิดไฟล์ Excel
    const workbook = XLSX.readFile(file.path)

    // sheet แรก
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const withdrawData = await Withdraw.find()
    // แปลงเป็น JSON
    const data = XLSX.utils.sheet_to_json(sheet)

    for (const row of data) {
      const existing = await Withdraw.find({ Des_Area: row.areaOld })

      if (!existing || existing.length === 0) continue

      const Des_No = row.areaNew
      const Des_Area = row.areaNew
      const ROUTE = `${row.areaNew}R`

      let WH = ''

      for (const doc of existing) {

        if (typeof doc.ROUTE === 'string' && doc.ROUTE.includes('R')) {
          WH = row.selfPickUp
        } else {
          WH = row.address
        }

        const email = emailMap[String(WH).trim()] || ''

        await Withdraw.updateMany(
          { Des_Area: row.areaOld },
          { $set: { Des_Area, Des_No, ROUTE, WH, Dc_Email: email } }
        )
      }

      console.log(`🔄 UPDATED: ${row.areaOld}`)
    }


    res.status(200).json({
      status: 200,
      message: 'updatePlaceAddressExcel',
      data
    })

  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}


exports.addAddressFromExcel = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { Withdraw } = getModelsByChannel(channel, res, distributionModel)
    // ✅ เปิดไฟล์ Excel
    const workbook = XLSX.readFile(req.file.path)

    // sheet แรก
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]

    // แปลงเป็น JSON
    const dataExcel = XLSX.utils.sheet_to_json(sheet)
    const emailMap = {
      '109': 'dc_nr@onetwotrading.co.th',
      '101': 'dc_np2@onetwotrading.co.th',
      '102': 'dc_mk@onetwotrading.co.th',
      '104': 'dc_sr@onetwotrading.co.th',
      '105': 'dc_samutprakan@onetwotrading.co.th',
      '106': 'dc_nakhonsawan@onetwotrading.co.th',
      '103': 'dc_lp@onetwotrading.co.th',
      '111': 'dc_np2@onetwotrading.co.th',
      '121': '',
      '110': '',
    };

    for (const row of dataExcel) {
      const area = row.area.slice(0, 5)
      const address = row.address?.trim() || ''

      const OAADR1 = address.substring(0, 35)
      const OAADR2 = address.length > 35
        ? address.substring(35, 70) // ถ้าอยากเผื่อ OAADR2 35 ตัวเหมือนกัน
        : ''
      const email = emailMap[String(werehouse).trim()] || ''

      const ciaddrData = {
        coNo: 410,
        OAADTH: 4,
        OAADK1: row.area,
        OAADK2: '',
        OAADK3: '',
        OACONM: row.address,
        OAADR1: OAADR1,
        OAADR2: OAADR2,
        OAADR3: row.werehouse,
        OAADR4: '',
        OACSCD: 'TH',
        OAPONO: area,
        // OARGDT: row.Des_Date,
        OALMDT: formatDate(),
        OACHID: 'MI02',
        OALMTS: `${Date.now()}`,
      }

      // data.push(dataTran)
      const withDraw = {
        Des_No: '',
        Des_Name: "",
        Des_Date: "",
        Des_Area: area,
        ZType: "T05",
        WH: row.werehouse,
        ROUTE: area,
        WH1: row.WH1,
        Dc_Email: email
      }
      // await CIADDR.create(dataTran, { transaction: t })  // 🟩 ผูกกับ transaction
    }




    res.status(201).json({
      stats: 201,
      message: 'Add address success',
      // data: ciaddrData

    })

  } catch (error) {
    console.log(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}