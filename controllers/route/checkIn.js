// const { Route } = require('../../models/cash/route')
// const { Store } = require('../../models/cash/store')

const { getModelsByChannel } = require('../../middleware/channel')

const  routeModel  = require('../../models/cash/route')
const  storeModel  = require('../../models/cash/store')

async function checkInRoute(data,channel,res) {
    try {
        if (!data) {
            throw new Error('Data check-in is required')
        }

        const { Store } = getModelsByChannel(channel,res,storeModel); 

        const { Route } = getModelsByChannel(channel,res,routeModel); 


        const store = await Store.findOne({ storeId: data.storeId })
        if (!store) {
            return { status: 404, message: 'Store not found' }
        }

        let route = await Route.findOne({ id: data.routeId, "listStore.storeInfo": store._id })

        if (!route) {
            return { status: 404, message: 'Route not found or listStore not matched' }
        }

        const storeIndex = route.listStore.findIndex(storeItem => storeItem.storeInfo.toString() === store._id.toString())

        if (storeIndex === -1) {
            return { status: 404, message: 'Store not found in route' }
        }

        let updateData = {
            "listStore.$.note": data.note || '',
            // "listStore.$.image": '',
            "listStore.$.latitude": data.latitude,
            "listStore.$.longtitude": data.longitude,
            "listStore.$.status": '3',
            "listStore.$.statusText": 'ซื้อ',
            "listStore.$.date": new Date()
        }

        if (data.orderId) {
            const listOrder = route.listStore[storeIndex].listOrder || []
            const newNumber = listOrder.length + 1

            const newOrder = {
                number: newNumber,
                orderId: data.orderId,
                status: '3',
                statusText: 'ซื้อ',
                date: new Date()
            }

            updateData["listStore.$.listOrder"] = [...listOrder, newOrder]
        }

        route = await Route.findOneAndUpdate(
            { id: data.routeId, "listStore.storeInfo": store._id },
            { $set: updateData },
            { new: true }
        )

        if (!route) {
            return { status: 404, message: 'Route update failed' }
        }

        return { status: 200, message: 'Check In Successfully!' }

    } catch (error) {
        console.error('Error transforming cart data:', error.message)
        return { status: 500, message: 'Server error' }
    }
}

module.exports = { checkInRoute }