const axios = require('axios')
const moment = require('moment')
// const { Product } = require('../../models/cash/product')
// const { Receive, Place } = require('../../models/cash/distribution')
// const { User } = require('../../models/cash/user')
const { getSocket } = require('../../socket')
const productModel = require('../../models/cash/product')
const distributionModel = require('../../models/cash/distribution')
const userModel = require('../../models/cash/user')
const { getModelsByChannel } = require('../../middleware/channel')


exports.addReceive = async (req, res) => {
  // const session = await require('mongoose').startSession();
  // session.startTransaction();
  try {
    const today = moment().format('YYYYMMDD');
    const response = await axios.post(`${process.env.API_URL_12ERP}/receive/getReceiveAll`, { transdate: today });
    const receiveData = response.data;

    const channel = req.headers['x-channel'];
    const { User } = getModelsByChannel(channel, res, userModel);
    const { Receive, Place } = getModelsByChannel(channel, res, distributionModel);
    const { Product } = getModelsByChannel(channel, res, productModel);

    if (!Array.isArray(receiveData) || receiveData.length === 0) {
      // await session.abortTransaction();
      // session.endSession();
      return res.status(400).json({ status: 400, message: 'No receive data found' });
    }

    const createdOrderIds = [];

    for (const receive of receiveData) {
      const { orderId, orderType, area, fromWarehouse, toWarehouse, shippingId, shippingRoute, shippingName, sendAddress, sendDate, remark, listProduct } = receive;

      const user = await User.findOne({ area })
      // .session(session);
      const place = await Place.findOne({ area })
      // .session(session);
      const orderTypeName = place?.listAddress?.find(addr => addr.type === orderType)?.typeNameTH || '';
      const saleCode = user?.saleCode || '';

      let totalQty = 0;
      let totalWeightGross = 0;
      let totalWeightNet = 0;
      let total = 0;

      const newListProduct = [];
      let isValid = true;

      for (const item of listProduct) {
        const product = await Product.findOne({ id: item.id }).lean();

        if (!product) {
          console.warn(`Product not found: ${item.id}`);
          isValid = false;
          break;
        }

        const unitInfo = product.listUnit?.find(u => u.unit === item.unit);

        if (!unitInfo) {
          console.warn(`Unit not found for product: ${item.id}, unit: ${item.unit}`);
          isValid = false;
          break;
        }

        const price = parseFloat(unitInfo.price?.sale || 0);
        const totalPrice = price * item.qty;

        newListProduct.push({
          id: item.id,
          name: product.name,
          group: product.group || '',
          brand: product.brand || '',
          size: product.size || '',
          flavour: product.flavour || '',
          qty: item.qty,
          unit: item.unit,
          qtyPcs: item.qtyPcs,
          price,
          total: totalPrice,
          weightGross: item.weightGross,
          weightNet: item.weightNet,
          lot: item.lot || ''
        });

        totalQty += item.qtyPcs;
        totalWeightGross += item.weightGross;
        totalWeightNet += item.weightNet;
        total += totalPrice;
      }

      if (!isValid) continue;

      await Receive.create([{
        orderId,
        orderType,
        orderTypeName,
        area,
        saleCode,
        fromWarehouse,
        toWarehouse,
        shippingId,
        shippingRoute,
        shippingName,
        sendAddress,
        sendDate,
        remark,
        listProduct: newListProduct,
        total,
        totalQty,
        totalWeightGross,
        totalWeightNet,
        status: 'pending'
      }]);

      createdOrderIds.push(orderId);
    }

    // ส่วนนี้อยู่ใน transaction เดียวกัน ถ้าอยากให้ transaction สมบูรณ์เมื่อ API สำเร็จ
    if (createdOrderIds.length > 0) {
      const apiResponse = await axios.post(`${process.env.API_URL_12ERP}/receive/updateStatus`, {
        orderList: createdOrderIds
      });

      // ตรวจสอบว่าการ call API สำเร็จจริง (ตาม response structure)
      if (apiResponse.status !== 200) {
        throw new Error('Update status to 12ERP API failed');
      }
    }

    // await session.commitTransaction();
    // session.endSession();


    const io = getSocket()
    io.emit('distribution/receive/addReceive', {});

    res.status(200).json({
      status: 200,
      message: 'Receive data saved and status updated successfully!'
    });
  } catch (error) {
    // await session.abortTransaction().catch(() => { });
    // session.endSession();
    console.error('Error adding receive:', error);
    res.status(500).json({ status: 500, message: 'Error adding receive', error: error.message });
  }
};
