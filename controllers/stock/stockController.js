const { Stock } = require('../../models/cash/stock')
const { User } = require('../../models/cash/user')
const { Product } = require('../../models/cash/product')
const { getStockAvailable } = require('./available')
const { getStockMovement } = require('../../utilities/movement')

exports.addStock = async (req, res) => {
    try {
        const body = req.body

        if (!Array.isArray(body)) {
            return res.status(400).json({ status: 400, message: 'Invalid format: expected an array' })
        }

        for (const item of body) {
            const { area, period, listProduct } = item

            if (!area || !Array.isArray(listProduct)) continue

            const user = await User.findOne({ area }).select('saleCode').lean()
            if (!user) continue

            const saleCode = user.saleCode

            let enrichedListProduct = []

            for (const productEntry of listProduct) {
                const { productId, available } = productEntry

                const productInfo = await Product.findOne({ id: productId }).lean()
                if (!productInfo) continue

                enrichedListProduct.push({
                    productId,
                    productName: productInfo.name || '',
                    productGroup: productInfo.group || '',
                    productFlavour: productInfo.flavour || '',
                    productSize: productInfo.size || '',
                    available: Array.isArray(available) ? available : []
                })
            }

            
            if (enrichedListProduct.length > 0) {
                const stockDoc = new Stock({
                    area,
                    saleCode,
                    period,
                    listProduct: enrichedListProduct
                })
                // await stockDoc.save()
                res.status(200).json({
                    status: 200,
                    message: stockDoc,
                })
            }
        }

        // res.status(200).json({
        //     status: 200,
        //     message: stockDoc,
        // })

    } catch (error) {
        console.error('Error adding stock:', error)
        res.status(500).json({ status: 500, message: error.message })
    }
}

exports.available = async (req, res) => {
    try {
        const { area, period } = req.query
        const data = await getStockAvailable(area, period)
        res.status(200).json({
            status: 200,
            message: 'successfully',
            data: data
        })
    } catch (error) {
        console.error('Error available stock:', error)
        res.status(500).json({ status: 500, message: error.message })
    }
}

exports.transaction = async (req, res) => {
    try {
        const { area, period } = req.query
        const movement = await getStockMovement(area, period)
        res.status(200).json({
            status: 200,
            message: 'successfully!',
            data: movement
        })
    } catch (error) {
        console.error('Error updating order:', error)
        res.status(500).json({ status: 500, message: 'Server error' })
    }
}

exports.getProductAndStock = async (req, res) => {
    try {
        const {  area, period, type, group, brand, size, flavour } = req.body
        const stock = await Stock.find(
            {
            area:area,
            period:period ,
        }
    )  
        let productIDs = []
        stock.forEach(stockItem  => {
            // productIDs.push(product.productId)
            // console.log(product)
            stockItem.listProduct.forEach(product => {
                productIDs.push(product.productId)
            })
        })
        // console.log("productIDs",productIDs)

        const stocks  = stock.map(stockItem =>{
            stockItem.listProduct.map(product => {
                // console.log(product)
                product.available.map(available => {
                    console.log(available.qtyPcs)
                })
            })
        })




        if (!type || !['sale', 'refund', 'withdraw'].includes(type)) {
            return res.status(400).json({
                status: '400',
                message: 'Invalid type! Required: sale, refund, or withdraw.'
            })
        }
        let filter = {}

        if (type === 'sale') filter.statusSale = 'Y'
        if (type === 'refund') filter.statusRefund = 'Y'
        if (type === 'withdraw') filter.statusWithdraw = 'Y'

        const parseArrayParam = (param) => {
            if (!param) return []
            try {
                return typeof param === 'string' ? JSON.parse(param) : param
            } catch (error) {
                return param.split(',')
            }
        }

        const groupArray = parseArrayParam(group)
        const brandArray = parseArrayParam(brand)
        const sizeArray = parseArrayParam(size)
        const flavourArray = parseArrayParam(flavour)

        let conditions = []
        if (groupArray.length) conditions.push({ group: { $in: groupArray } })
        if (brandArray.length) conditions.push({ brand: { $in: brandArray } })
        if (sizeArray.length) conditions.push({ size: { $in: sizeArray } })
        if (flavourArray.length) conditions.push({ flavour: { $in: flavourArray } })

        if (conditions.length) filter.$and = conditions

        let products = await Product.find({
            ...filter,  // ขยายเงื่อนไขใน filter ที่มีอยู่
            id: { $in: productIDs }  // เพิ่มเงื่อนไขค้นหาว่า id อยู่ใน productIDs
          }).lean();

          products.forEach(item => {
            item.listUnit.forEach(unit => {
              unit.price.refund = unit.price.sale;
            });
          });

          const dataProducts = products.map(product => ({
            _id:product._id,
            id:product.id,
            name:product.name,
            group:product.group,
            brand:product.brand,
            size:product.size,
            flavour:product.flavour,
            type:product.type,
            weightGross:product.weightGross,
            weightNet:product.weightNet,
            statusSale:product.statusSale,
            statusWithdraw:product.statusWithdraw,
            statusRefund:product.statusRefund,
            image:product.image,
            // listUnit:,
            listUnit: product.listUnit.map(listUnit =>({
                unit: listUnit.unit,
                name: listUnit.name,
                factor: listUnit.price.factor,
                price : listUnit.price.sale,
                // available : listUnit.price
            }))
          })) 



 

        res.status(200).json({
            status: "200",
            message: "Products fetched successfully!",
            data : stocks
        })
 

    } catch (error) {
        console.error(error);
        res.status(500).json({ status: '501', message: error.message })
    }
    // res.status(200).json({
    //     data:"getProductAndStock"
    // })
}