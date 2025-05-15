const  deliveryModel  = require('../../models/cash/delivery')
const { getModelsByChannel } = require('../../middleware/channel')


exports.addDelivery = async (req,res) => {
    try {

        const { stratMonth } = req.body

        const channel = req.headers['x-channel'];
        const { Delivery } = getModelsByChannel(channel,res,deliveryModel); 

        const deliveryDateStart = new Date(`${stratMonth}-01`);
        const deliveryExit = await Delivery.findOne({deliveryDateStart:deliveryDateStart})
        if (deliveryExit) {

            return res.status(400).json({
                Message:"Already have in database"
            })
        }
        
        const deliveryDateEnd = new Date(deliveryDateStart);
        deliveryDateEnd.setMonth(deliveryDateEnd.getMonth() + 1);
        deliveryDateEnd.setDate(5);
        const formatDate = date => date.toISOString().slice(0, 10);

        preparationDays = 3
        displayDays = 2

        await Delivery.create({
        deliveryDateStart,
        deliveryDateEnd,
        preparationDays,
        displayDays
        });


    res.status(200).json({
        status:200,
        Message:"Add deliveryDate Sucess"
    })
    
    } catch (error) {
        console.error(error)
        res.status(500).json({ status: '500', message: error.message })
    }
}