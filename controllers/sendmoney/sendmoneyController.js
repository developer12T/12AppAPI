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
    const { area, date} = req.body
    const { Route } = getModelsByChannel(channel,res,routeModel); 

    const year = parseInt(date.toString().slice(0, 4), 10);
    const month = parseInt(date.toString().slice(4, 6), 10);
    const day = parseInt(date.toString().slice(6, 8), 10);

    // สร้าง Date เวลาไทย (UTC+7) → ต้องลบ 7 ชม. เพื่อให้กลายเป็น UTC ที่เท่ากับเวลาไทย
    const startDate = new Date(Date.UTC(year, month, day - 1, 17, 0, 0)); // 00:00 เวลาไทย
    const endDate = new Date(Date.UTC(year, month, day, 17, 0, 0));       // วันถัดไป 00:00 เวลาไทย

    const fullMonth = month.toString().padStart(2, '0');
    const period = `${year}${fullMonth}`


    const routeData = await Route.aggregate([
    { $match: { area: area ,period:period} },
    { $unwind: { path: '$listStore', preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$listStore.listOrder', preserveNullAndEmptyArrays: true } },
      {
    $match: {
      'listStore.listOrder': { $ne: null }
    }
  },
    {
        $match: {
        'listStore.listOrder.date': {
            $gte: startDate,
            $lt: endDate
        }
        }
    },
    {$project:{
        _id:0,
        'listStore.listOrder':1
    }},
    {$lookup:{
        from:'orders',
        localField:'listStore.listOrder.orderId',
        foreignField:'orderId',
        as:'order'
    }},
    {
    $unwind: {
        path: "$order",
        preserveNullAndEmptyArrays: false
    }
    },
    {$match:{
        'order.status':'pending'
    }},
    {
    $group: {
        _id: null,
        sendmoney: { $sum: "$order.total" }
    }
    },
    {$project:{
        _id:0,
        sendmoney:1,
        status:'ยังไม่ได้ส่งเงิน'
    }}
    ]);
    
let data = routeData;
if (!routeData[0]) {

data = await Route.aggregate([
    { $match: { area: area ,period:period} },
    { $unwind: { path: '$listStore', preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$listStore.listOrder', preserveNullAndEmptyArrays: true } },
      {
    $match: {
      'listStore.listOrder': { $ne: null }
    }
  },
    {$project:{
        _id:0,
        'listStore.listOrder':1
    }},
    {$lookup:{
        from:'orders',
        localField:'listStore.listOrder.orderId',
        foreignField:'orderId',
        as:'order'
    }},
    {
    $unwind: {
        path: "$order",
        preserveNullAndEmptyArrays: false
    }
    },
    {$match:{
        'order.status':'pending'
    }},
    {
    $group: {
        _id: null,
        sendmoney: { $sum: "$order.total" }
    }
    },
    {$project:{
        _id:0,
        sendmoney:1,
        status:'ยังไม่ได้ส่งเงิน'
    }}
    ]);


}


// console.log(JSON.stringify(routeData, null, 2));
        res.status(200).json({
        status:200,
        message:"success",
        data:data[0]
    })
}