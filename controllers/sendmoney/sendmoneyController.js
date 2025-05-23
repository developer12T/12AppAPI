const { getModelsByChannel } = require('../../middleware/channel')
const orderModel  = require('../../models/cash/sale')
const routeModel = require('../../models/cash/route')
const sendmoneyModel = require('../../models/cash/sendmoney')


exports.addSendMoney = async (req , res) => {

    const channel = req.headers['x-channel'];
    const { SendMoney } = getModelsByChannel(channel,res,sendmoneyModel); 
    const { area, date, sendmoney} = req.body

    const year = parseInt(date.slice(0, 4), 10);
    const month = parseInt(date.slice(4, 6), 10) - 1;
    const day = parseInt(date.slice(6, 8), 10);

    const dateObj = new Date(year, month, day);

    const sendmoneyData = await SendMoney.create({
        area:area,
        date:dateObj,
        sendmoney:sendmoney
    })

    res.status(200).json({
        status:200,
        message:"success"
    })
}

exports.getSendMoney = async (req,res) => {

    const channel = req.headers['x-channel'];
    const { area, date, sendmoney} = req.body
    const { Route } = getModelsByChannel(channel,res,routeModel); 

    const routeData = await Route.aggregate( [
        {$match:{
            area:area
        }},
        { $unwind: { path: '$listStore', preserveNullAndEmptyArrays: true } },
        {$match:{
            'listStore':area
        }},
     ])


        res.status(200).json({
        status:200,
        message:"success",
        data:routeData
    })
}