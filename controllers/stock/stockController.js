const { Stock, StockMovement } = require('../../models/cash/stock')
const { User } = require('../../models/cash/user')
const { Product } = require('../../models/cash/product')
const path = require('path')
const errorEndpoint = require('../../middleware/errorEndpoint')
const currentFilePath = path.basename(__filename)
const { getStockAvailable } = require('./available')
const { getStockMovement } = require('../../utilities/movement')
const { Warehouse, Locate, Balance } = require('../../models/cash/master')
const { Op } = require('sequelize')
const XLSX = require('xlsx')

// const { fetchArea } = require('./fetchArea')

const fetchArea = async () => {
  try {
    // const { warehouseCode } = req.body
    const WarehouseData = await Warehouse.findAll({
      where: {
        coNo: 410,
        warehouse: '215'
      }
    })

    const warehouses = []

    WarehouseData.forEach(warehouseInstance => {
      // เข้าถึง dataValues ของแต่ละอินสแตนซ์
      const warehouse = warehouseInstance.dataValues

      // พิมพ์ข้อมูลจาก dataValues
      warehouses.push(warehouse)
    })

    // แปลงข้อมูล warehouse ให้เป็น areaData
    const areaData = warehouses.map(warehouse => {
      // ใช้ RegEx เพื่อตรวจจับแค่ 2 ตัวแรก A-Z และ 3 ตัวหลัง 0-9
      const area = String(warehouse.warehouseName)
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 5) // ลบทุกตัวที่ไม่ใช่ A-Z และ 0-9

      // ตรวจสอบว่าได้รูปแบบที่ถูกต้อง A-Z 2 ตัวแรก + 0-9 3 ตัวหลัง
      const validArea = /^([A-Z]{2})(\d{3})$/.test(area) ? area : null

      return {
        coNo: warehouse.coNo,
        warehouse: warehouse.warehouse,
        warehouseName: warehouse.warehouseName,
        area: validArea // หาก valid จะเป็นค่าที่ได้ หากไม่ตรงเงื่อนไขจะเป็น null
      }
    })

    // กรองข้อมูลที่ area ไม่เป็น null (หมายความว่าตรงตามเงื่อนไข)
    const filteredAreaData = areaData.filter(item => item.area !== null)

    return filteredAreaData
  } catch (error) {
    // Enhanced error handling
    throw errorEndpoint(currentFilePath, 'fetchArea', error)
  }
}

exports.addStock = async (req, res) => {
  try {
    const body = req.body

    if (!Array.isArray(body)) {
      return res
        .status(400)
        .json({ status: 400, message: 'Invalid format: expected an array' })
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
          message: stockDoc
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

exports.addStockNew = async (req, res) => {
  const { period } = req.body
  const locateData = {}
  const factorData = {}
  //    console.log(area,saleCode,period)

  const areaData = await fetchArea()
  const warehouse = '215'
  const BalanceData = await Balance.findAll({
    where: {
      warehouse: warehouse,
      coNo: 410,
      // itemCode: '10010601011'
      itemCode: {
        [Op.or]: [
          { [Op.ne]: null },
          { [Op.ne]: '' },
          // { [Op.eq]: "600102390" },
          { [Op.notLike]: 'ZNS%' },
          { [Op.notLike]: '800%' },
          { [Op.notLike]: 'PRO%' },
          { [Op.notLike]: 'DIS%' },
          { [Op.notLike]: '100            ' }
        ]
      }
    }
  })

  for (let i = 0; i < BalanceData.length; i++) {
    locateData[BalanceData[i].itemCode.trim()] = []
    factorData[BalanceData[i].itemCode.trim()] = []
    // console.log(`BalanceData[${i}].itemCode`, BalanceData[i].itemCode)
    // console.log('locateData[BalanceData[i].itemCode.trim()]', locateData)
    const locate = await Locate.findAll({
      where: {
        warehouse: warehouse,
        itemCode: BalanceData[i].itemCode.trim(),
        coNo: 410
      }
    })

    for (let j = 0; j < locate.length; j++) {
      locateData[BalanceData[i].itemCode.trim()].push({
        location: locate[j].location.trim(),
        lot: locate[j].lot,
        itemOnHand: locate[j].itemOnHand,
        itemallocated: locate[j].itemallocated // Assuming promotionName is a property of PromotionData
      })
    }
  }

  const stocks = BalanceData.map(stock => {
    const locate = locateData[stock.itemCode.trim()] || []
    const itemCode = stock.itemCode.trim()

    return {
      coNo: stock.coNo,
      warehouse: stock.warehouse,
      itemCode: itemCode,
      itemPcs: stock.itemPcs,
      allocateMethod: stock.allocateMethod,
      itemallocated: stock.itemallocated,
      itemAllowcatable: stock.itemAllowcatable,
      lot: locate
    }
  })

  const productIds = stocks.map(item => item.itemCode)
  const productDetail = await Product.find({
    id: { $in: productIds }
  }).select('id listUnit.unit listUnit.factor')

  const areaIds = areaData.map(area => area.area)
  const userDetail = await User.find({
    area: { $in: areaIds }
  }).select('area saleCode')

  const productFactors = productDetail.map(product => {
    const ctnUnit = product.listUnit.find(unit => unit.unit === 'CTN')
    return {
      id: product.id,
      factor: ctnUnit ? parseInt(ctnUnit.factor) : 0 // หรือ default ค่าอื่นเช่น 1
    }
  })

  // console.log("productFactors",productFactors)
  data = []
  if (areaData) {
    areaData.forEach(area => {
      // ค้นหาสินค้าในสต็อกตามคลังสินค้า
      const productID = stocks.filter(
        item =>
          item.warehouse === area.warehouse &&
          Array.isArray(item.lot) &&
          item.lot.length > 0
      )
      const SaleCode = userDetail.find(sale => sale.area === area.area) || {}

      let listProduct = []

      if (productID.length > 0) {
        listProduct = productID.map(product => {
          const productId = product.itemCode
          const Factor = productFactors.find(pf => pf.id === productId) || {}
          const sumQtyPcs = product.lot.reduce(
            (sum, obj) => sum + (obj.itemOnHand || 0),
            0
          ) // ตรงนี้คุณเขียน obj.lot.itemOnHand แต่จริงๆ obj คือ lot แล้ว
          const sumQtyCtn = product.lot.reduce(
            (sum, obj) =>
              sum +
              (Factor?.factor && Factor.factor > 0
                ? Math.floor(obj.itemOnHand / Factor.factor) // ใช้ obj แทน lot
                : 0),
            0
          )

          lotList = product.lot.map(lot => ({
            location: lot.location,
            lot: lot.lot,
            qtyPcs: lot.itemOnHand,
            qtyCtn:
              Factor?.factor && Factor.factor > 0
                ? Math.floor(lot.itemOnHand / Factor.factor)
                : 0
          }))

          return {
            productId: productId,
            sumQtyPcs: sumQtyPcs,
            sumQtyCtn: sumQtyCtn,
            available: lotList
          }
        })
      }

      data.push({
        area: area.area,
        saleCode: SaleCode?.saleCode || 'Null',
        period: period,
        warehouse: area.warehouse,
        listProduct: listProduct
      })
    })
  }
  await Stock.insertMany(data)

  res.status(200).json({
    data: data,
    message: 'Successfull Insert'
  })
}

exports.stockToExcel = async (req, res) => {
  const { area, period, type } = req.body

  const modelStock = await Stock.findOne({ area: area })

  const tableData = {
    area: modelStock.area,
    saleCode: modelStock.saleCode,
    period: modelStock.period,
    warehouse: modelStock.warehouse,
    listProduct: modelStock.listProduct.map(product => ({
      productId: product.productId
    }))
  }

  // สร้าง worksheet และ workbook
  const worksheet = XLSX.utils.json_to_sheet(tableData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'StockList')

  // เขียนไฟล์ .xlsx
  XLSX.writeFile(workbook, 'stock_list.xlsx')

  console.log('✅ สร้างไฟล์ stock_list.xlsx สำเร็จแล้ว!')

  res.status(200).json({
    main: stockData,
    message: modelStock
  })
}

// exports.getProductAndStock = async (req, res) => {
//   try {
//       const {  area, period, type, group, brand, size, flavour } = req.body
//       // console.log(area,period)
//       const stock = await Stock.find(
//           {
//           area:area,
//           period:period ,
//       }
//   )
//       // console.log("stock", JSON.stringify(stock, null, 2));
//       let stockDatas = []
//       stock.forEach(stockItem  => {

//           stockItem.listProduct.forEach(product => {

//               product.available.forEach(availableItem => {
//                 stockDatas.push({
//                       id: product.productId,
//                       lot: availableItem.lot,
//                       qtyPcs: availableItem.qtyPcs,
//                       qtyCtn: availableItem.qtyCtn
//                   });
//               }

//               )
//           })
//       })

//       if (!type || !['sale', 'refund', 'withdraw'].includes(type)) {
//           return res.status(400).json({
//               status: '400',
//               message: 'Invalid type! Required: sale, refund, or withdraw.'
//           })
//       }
//       let filter = {}

//       if (type === 'sale') filter.statusSale = 'Y'
//       if (type === 'refund') filter.statusRefund = 'Y'
//       if (type === 'withdraw') filter.statusWithdraw = 'Y'

//       const parseArrayParam = (param) => {
//           if (!param) return []
//           try {
//               return typeof param === 'string' ? JSON.parse(param) : param
//           } catch (error) {
//               return param.split(',')
//           }
//       }

//       const groupArray = parseArrayParam(group)
//       const brandArray = parseArrayParam(brand)
//       const sizeArray = parseArrayParam(size)
//       const flavourArray = parseArrayParam(flavour)

//       let conditions = []
//       if (groupArray.length) conditions.push({ group: { $in: groupArray } })
//       if (brandArray.length) conditions.push({ brand: { $in: brandArray } })
//       if (sizeArray.length) conditions.push({ size: { $in: sizeArray } })
//       if (flavourArray.length) conditions.push({ flavour: { $in: flavourArray } })

//       if (conditions.length) filter.$and = conditions

//       let products = await Product.find({
//           ...filter,  // ขยายเงื่อนไขใน filter ที่มีอยู่
//           id: { $in: stockDatas.map(item => item.id) }  // เพิ่มเงื่อนไขค้นหาว่า id อยู่ใน productIDs
//         }).lean();

//         products.forEach(item => {
//           item.listUnit.forEach(unit => {
//             unit.price.refund = unit.price.sale;
//           });
//         });

//         // console.log('productIDs',productIDs)

//         let dataProducts = [];
//         stockDatas.forEach(product => {
//           const productDetail = products.find(item => item.id === product.id);
//           const stockData = stockDatas.find(item => item.id == product.id)
//           if (productDetail) {
//               // console.log("data", JSON.stringify(data, null, 2));

//             // สร้าง object ใหม่จาก data ที่พบ
//             const dataProduct = {
//               _id: productDetail._id,
//               id: productDetail.id,
//               name: productDetail.name,
//               group: productDetail.group,
//               brand: productDetail.brand,
//               size: productDetail.size,
//               flavour: productDetail.flavour,
//               type: productDetail.type,
//               weightGross: productDetail.weightGross,
//               weightNet: productDetail.weightNet,
//               statusSale: productDetail.statusSale,
//               statusWithdraw: productDetail.statusWithdraw,
//               statusRefund: productDetail.statusRefund,
//               image: productDetail.image,
//               // listUnit: productDetail.listUnit.map(listUnit => ({
//                 // unit: listUnit.unit,
//                 // name: listUnit.name,
//                 // factor: listUnit.price.factor,
//                 // price: listUnit.price.sale,
//               available : listUnit.available.map(avail =>({
//                   qtyPcs : avail.qtyPcs,
//                   lot : avail.lot
//               }))
//               // }))
//             };

//             // เพิ่มข้อมูลลงใน dataProducts
//             dataProducts.push(dataProduct);
//           }
//         });

//       res.status(200).json({
//           status: 200,
//           message: "Products fetched successfully!",
//           data : dataProducts
//       })

//   } catch (error) {
//       console.error(error);
//       res.status(500).json({ status: '501', message: error.message })
//   }
//   // res.status(200).json({
//   //     data:"getProductAndStock"
//   // })
// }

exports.getQty = async (req, res, next) => {
  try {
    const { area, productId, unit } = req.body

    const productStock = await Stock.find({
      area: area
    })
    const products = await Product.find({})

    let unitData = {}

    const productUnitMatch = products?.find(p => p.id === productId)
    if (productUnitMatch) {
      unitData = productUnitMatch.listUnit.map(unit => ({
        unit: unit.unit,
        factor: unit.factor
      }))
    } else {
      res.status(404).json({
        message: 'Not Found This ItemId'
      })
    }

    const stockmatchList = []

    productStock.map(item => {
      const stockmatch = item.listProduct.find(p => p.productId === productId)

      if (stockmatch) {
        stockmatchList.push(stockmatch)
      }
    })

    const qtyList = stockmatchList.flatMap(product =>
      product.available.map(lot => lot.qtyPcs)
    )
    const lotList = stockmatchList.flatMap(product =>
      product.available.map(lot => lot.lot)
    )

    const totalQtyPcs = qtyList.reduce((sum, qty) => sum + qty, 0)

    const productUnit = unitData.find(p => p.unit === unit)

    const lotFirst = lotList[0]

    const data = {
      area: area,
      productId: productId,
      sumQtyPcs: totalQtyPcs,
      qty: Math.floor(totalQtyPcs / productUnit.factor),
      unit: unit,
      lot: lotFirst
    }

    res.status(200).json({
      status: 200,
      message: 'Stock Quantity fetched successfully!',
      data: data
    })
  } catch (error) {
    console.error('Error transforming cart data:', error.message)
    return { status: 500, message: 'Server error' }
  }
}

exports.addStockMovement = async (req, res, next) => {
  try {
    const { orderId, area, saleCode, period, warehouse, status, product } = req.body

    const newStockMovement = new StockMovement({
      orderId,
      area,
      saleCode,
      period,
      warehouse,
      status,
      product
    })
    newStockMovement.save()
    res.status(200).json({
      status: 200,
      message: 'Stock Movement added successfully!'
    })
  } catch (error) {
    next(error)
  } 
}
