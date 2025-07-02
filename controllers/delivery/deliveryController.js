const deliveryModel = require('../../models/cash/delivery')
const { getModelsByChannel } = require('../../middleware/channel')
const { getSocket } = require('../../socket')

exports.addDelivery = async (req, res) => {
    const session = await require('mongoose').startSession();
    session.startTransaction();
    try {
        const { stratMonth } = req.body;

        const channel = req.headers['x-channel'];
        const { Delivery } = getModelsByChannel(channel, res, deliveryModel);

        const deliveryDateStart = new Date(`${stratMonth}-01`);
        const deliveryExit = await Delivery.findOne({ deliveryDateStart: deliveryDateStart }).session(session);
        if (deliveryExit) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                Message: "Already have in database"
            });
        }

        const deliveryDateEnd = new Date(deliveryDateStart);
        deliveryDateEnd.setMonth(deliveryDateEnd.getMonth() + 1);
        deliveryDateEnd.setDate(5);

        const preparationDays = 3; // ต้องมี let/const
        const displayDays = 2;

        await Delivery.create([{
            deliveryDateStart,
            deliveryDateEnd,
            preparationDays,
            displayDays
        }], { session });

        await session.commitTransaction();
        session.endSession();

        const io = getSocket()
        io.emit('delivery/addDelivery', {});

        res.status(200).json({
            status: 200,
            Message: "Add deliveryDate Success"
        });

    } catch (error) {
        await session.abortTransaction().catch(() => { });
        session.endSession();
        res.status(500).json({ status: 500, message: error.message });
    }
};
