const { Place } = require('../../models/cash/distribution')


exports.getPlace = async (req, res) => {
    try {
        const { area, type } = req.query

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
    try {
        const { area, listAddress } = req.body

        if (!area || !listAddress) {
            return res.status(400).json({ status: 400, message: 'area and listAddress are required!' })
        }

        let place = await Place.findOne({ area: area })
        if (!place) {
            place = await Place.create({
                area,
                listAddress
            })
        } else {
            const existingIds = new Set(place.listAddress.map(addr => addr.id))
            const newAddresses = listAddress.filter(addr => !existingIds.has(addr.id))
            if (newAddresses.length > 0) {
                place.listAddress.push(...newAddresses)
                await place.save()
            }
        }

        res.status(200).json({
            status: '200',
            message: 'Place added successfully!',
            // data: cart
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ status: '500', message: error.message })
    }
}

exports.getType = async (req, res) => {
    try {
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
                uniqueTypes.push({
                    type: address.type,
                    typeNameTH: address.typeNameTH,
                    typeNameEN: address.typeNameEN
                })
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