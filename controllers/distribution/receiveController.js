const axios = require('axios')
const moment = require('moment')
const { Product } = require('../../models/cash/product')
const { Receive, Place } = require('../../models/cash/distribution')
const { User } = require('../../models/cash/user')

exports.addReceive = async (req, res) => {
    try {
      const today = moment().format('YYYYMMDD')
      // const response = await axios.post(`${process.env.API_URL_12ERP}/receive/getReceiveAll`, { transdate: today })
      const response = await axios.post(`${process.env.API_URL_12ERP}/receive/getReceiveAll`, { area: 'BE215', peroid: "202503" })
      const receiveData = response.data
  
      if (!Array.isArray(receiveData) || receiveData.length === 0) {
        return res.status(400).json({ status: 400, message: 'No receive data found' })
      }
  
      const createdOrderIds = []
  
      for (const receive of receiveData) {
        const { orderId, orderType, area, fromWarehouse, toWarehouse, shippingId, shippingRoute, shippingName, sendAddress, sendDate, remark, listProduct } = receive
  
        const user = await User.findOne({ area })
        const place = await Place.findOne({ area })
        const orderTypeName = place?.listAddress?.find(addr => addr.type === orderType)?.typeNameTH || ''
        const saleCode = user?.saleCode || ''
  
        let totalQty = 0
        let totalWeightGross = 0
        let totalWeightNet = 0
        let total = 0
  
        const newListProduct = []
        let isValid = true
  
        for (const item of listProduct) {
          const product = await Product.findOne({ id: item.id }).lean()
  
          if (!product) {
            console.warn(`Product not found: ${item.id}`)
            isValid = false
            break
          }
  
          const unitInfo = product.listUnit?.find(u => u.unit === item.unit)
  
          if (!unitInfo) {
            console.warn(`Unit not found for product: ${item.id}, unit: ${item.unit}`)
            isValid = false
            break
          }
  
          const price = parseFloat(unitInfo.price?.sale || 0)
          const totalPrice = price * item.qty
  
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
          })
  
          totalQty += item.qtyPcs
          totalWeightGross += item.weightGross
          totalWeightNet += item.weightNet
          total += totalPrice
        }
  
        if (!isValid) continue
  
        await Receive.create({
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
        })
  
        createdOrderIds.push(orderId)
      }
  
      if (createdOrderIds.length > 0) {
        await axios.post(`${process.env.API_URL_12ERP}/receive/updateStatus`, {
          orderList: createdOrderIds
        })
      }
  
      res.status(200).json({ 
        status: 200, 
        message: 'Receive data saved successfully!'
      })
    } catch (error) {
      console.error('Error adding receive:', error)
      res.status(500).json({ status: 500, message: 'Error adding receive' })
    }
  }
  
