const { find, each, forEach } = require('lodash')
// const { Place,  Withdraw } = require('../../models/cash/distribution')
// const { User } = require('../../models/cash/user')
const { sequelize, DataTypes } = require('../../config/m3db')
const { getSocket } = require('../../socket')
const userModel = require('../../models/cash/user')
const distributionModel = require('../../models/cash/distribution')
const { getModelsByChannel } = require('../../middleware/channel')


exports.getPlace = async (req, res) => {
    try {
        const { area, type } = req.query

        const channel = req.headers['x-channel'];
        // console.log(channel)


        const { Place } = getModelsByChannel(channel, res, distributionModel);


        if (!area) {
            return res.status(400).json({ status: 400, message: 'area is required!' })
        }

        let place = await Place.findOne({ area }, { _id: 0, __v: 0 }).lean()

        if (!place) {
            return res.status(404).json({ status: 404, message: 'Place not found!' })
        }

        if (type) {
            place.listAddress = place.listAddress.filter(address => address.type === type)
        }

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
        const { area, listAddress } = req.body;

        const channel = req.headers['x-channel'];
        const { Place } = getModelsByChannel(channel, res, distributionModel);

        if (!area || !listAddress) {
            // await session.abortTransaction();
            // session.endSession();
            return res.status(400).json({ status: 400, message: 'area and listAddress are required!' });
        }

        let place = await Place.findOne({ area: area })
        // .session(session);
        if (!place) {
            place = await Place.create([{
                area,
                listAddress
            }]);
            place = place[0]; // create แบบ array
        } else {
            const existingIds = new Set(place.listAddress.map(addr => addr.id));
            const newAddresses = listAddress.filter(addr => !existingIds.has(addr.id));
            if (newAddresses.length > 0) {
                place.listAddress.push(...newAddresses);
                await place.save();
            }
        }

        // await session.commitTransaction();
        // session.endSession();

        const io = getSocket()
        io.emit('distribution/place/add', {});

        res.status(200).json({
            status: '200',
            message: 'Place added successfully!',
            data: place
        });

    } catch (error) {
        // await session.abortTransaction().catch(() => { });
        // session.endSession();
        console.error(error);
        res.status(500).json({ status: '500', message: error.message });
    }
};


exports.getType = async (req, res) => {
    try {
        const channel = req.headers['x-channel'];
        const { Place } = getModelsByChannel(channel, res, distributionModel);

        const places = await Place.find({}, { listAddress: 1 }).lean()

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
        const channel = req.headers['x-channel'];
        const { User } = getModelsByChannel(channel, res, userModel);
        const { Place, Withdraw } = getModelsByChannel(channel, res, distributionModel);


        const users = await User.find({ role: 'sale' })
        // .session(session)

        areaList = users.map(user => user.area)

        let data = []

        areaAdded = []
        // console.log("areaList",areaList)
        for (const user of areaList) {

            const withdrawT04 = await Withdraw.findOne({ Des_Area: user, ZType: "T04" })|| {};

            const withdrawT05 = await Withdraw.findOne({ Des_Area: user, ZType: "T05" })|| {};

            const checkPlace = await Place.findOne({ area: user })

            if (!checkPlace) {
                const t04 = {
                    type: "T04",
                    typeNameTH: withdrawT04.Des_Name,
                    typeNameEN: "pickup",
                    shippingId: withdrawT04.Des_Area,
                    route: withdrawT04.ROUTE,
                    name: "",
                    address: "",
                    district: "",
                    subDistrict: "",
                    province: "",
                    postcode: "",
                    tel: '',
                    warehouse: {
                        normal: withdrawT04.WH,
                        clearance: withdrawT04.WH1
                    }

                };
                //   data.push(t04)

                const t05 = {
                    type: "T05",
                    typeNameTH: "ส่งสินค้า",
                    typeNameEN: "delivery",
                    shippingId: withdrawT05.Des_No,
                    route: withdrawT05.Des_Area,
                    name: withdrawT05.Des_Name,
                    address: "",
                    district: "",
                    subDistrict: "",
                    province: "",
                    postcode: "",
                    tel: "",
                    warehouse: {
                        normal: withdrawT04.WH,
                        clearance: withdrawT04.WH1
                    }

                };


                const combineData = {
                    area: user,
                    listAddress: [
                        ...[t04],
                        ...[t05]
                    ]


                }
                data.push(combineData)
                areaAdded.push(combineData.area)
                placeDoc = new Place(combineData)
                await placeDoc.save()
            }

        }

        // await session.commitTransaction();
        // session.endSession();

        const io = getSocket()
        io.emit('distribution/place/addAllPlace', {});


        res.status(200).json({
            status: 200,
            message: `add place ${areaAdded} fetched successfully!`,
            data: data
        })


    } catch (error) {
        // await session.abortTransaction().catch(() => { });
        // session.endSession();
        console.error(error);
        res.status(500).json({ status: '500', message: error.message });
    }
}

