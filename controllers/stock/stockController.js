const { Stock } = require('../../models/cash/stock')
const { User } = require('../../models/cash/user')
const { Product } = require('../../models/cash/product')
const path = require('path')
const errorEndpoint = require('../../middleware/errorEndpoint')
const currentFilePath = path.basename(__filename)
const { getStockAvailable } = require('./available')
const { getStockMovement } = require('../../utilities/movement')
const { Warehouse,Locate,Balance } = require('../../models/cash/master')
const { Op } = require("sequelize");
// const { fetchArea } = require('./fetchArea')

const fetchArea = async () => {
    try {
      // const { warehouseCode } = req.body
      const WarehouseData = await Warehouse.findAll({
        where: {
          coNo: 410,
        //   warehouse: "211"
        }
      })

      warehouses = []

      WarehouseData.forEach((warehouseInstance) => {
        // เข้าถึง dataValues ของแต่ละอินสแตนซ์
        const warehouse = warehouseInstance.dataValues;
        
        // พิมพ์ข้อมูลจาก dataValues
        warehouses.push(warehouse);

      });

// แปลงข้อมูล warehouse ให้เป็น areaData
    const areaData = warehouses.map((warehouse) => {
    // ใช้ RegEx เพื่อตรวจจับแค่ 2 ตัวแรก A-Z และ 3 ตัวหลัง 0-9
    const area = String(warehouse.warehouseName).replace(/[^A-Z0-9]/g, '').slice(0, 5); // ลบทุกตัวที่ไม่ใช่ A-Z และ 0-9
  
    // ตรวจสอบว่าได้รูปแบบที่ถูกต้อง A-Z 2 ตัวแรก + 0-9 3 ตัวหลัง
    const validArea = /^([A-Z]{2})(\d{3})$/.test(area) ? area : null;
  
    return {
      coNo: warehouse.coNo,
      warehouse:  warehouse.warehouse,
      warehouseName: warehouse.warehouseName,
      area: validArea, // หาก valid จะเป็นค่าที่ได้ หากไม่ตรงเงื่อนไขจะเป็น null
    };
  });
  
  // กรองข้อมูลที่ area ไม่เป็น null (หมายความว่าตรงตามเงื่อนไข)
    const filteredAreaData = areaData.filter((item) => item.area !== null);


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
        console.log(area,period)
        const stock = await Stock.find(
            {
            area:area,
            period:period ,
        }
    )  
        console.log("stock", JSON.stringify(stock, null, 2));
        let productIDs = []
        stock.forEach(stockItem  => {

            
            stockItem.listProduct.forEach(product => {
                
                product.available.forEach(availableItem => {
                    productIDs.push({
                        id: product.productId,
                        lot: availableItem.lot,
                        qtyPcs: availableItem.qtyPcs,
                        qtyCtn: availableItem.qtyCtn
                    });
                }
                    
                )
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
            id: { $in: productIDs.map(item => item.id) }  // เพิ่มเงื่อนไขค้นหาว่า id อยู่ใน productIDs
          }).lean();

          products.forEach(item => {
            item.listUnit.forEach(unit => {
              unit.price.refund = unit.price.sale;
            });
          });

          console.log('productIDs',productIDs)

          let dataProducts = [];
          productIDs.forEach(product => {
            const data = products.find(item => item.id === product.id);
            if (data) {
                // console.log("data", JSON.stringify(data, null, 2));

              
              // สร้าง object ใหม่จาก data ที่พบ
              const dataProduct = {
                _id: data._id,
                id: data.id,
                name: data.name,
                group: data.group,
                brand: data.brand,
                size: data.size,
                flavour: data.flavour,
                type: data.type,
                weightGross: data.weightGross,
                weightNet: data.weightNet,
                statusSale: data.statusSale,
                statusWithdraw: data.statusWithdraw,
                statusRefund: data.statusRefund,
                image: data.image,
                listUnit: data.listUnit.map(listUnit => ({
                  unit: listUnit.unit,
                  name: listUnit.name,
                  factor: listUnit.price.factor,
                  price: listUnit.price.sale,
                //   available : listUnit.available.map(avail =>({
                //     qtyPcs : avail.qtyPcs,
                //     lot : avail.lot
                // }))
                }))
              };
          
              // เพิ่มข้อมูลลงใน dataProducts
              dataProducts.push(dataProduct);
            }
          });
          
        //   console.log(dataProducts);
          

    

        //   const dataProducts = products.map(product => ({
        //     _id:product._id,
        //     id:product.id,
        //     name:product.name,
        //     group:product.group,
        //     brand:product.brand,
        //     size:product.size,
        //     flavour:product.flavour,
        //     type:product.type,
        //     weightGross:product.weightGross,
        //     weightNet:product.weightNet,
        //     statusSale:product.statusSale,
        //     statusWithdraw:product.statusWithdraw,
        //     statusRefund:product.statusRefund,
        //     image:product.image,
        //     // listUnit:,
        //     listUnit: product.listUnit.map(listUnit =>({
        //         unit: listUnit.unit,
        //         name: listUnit.name,
        //         factor: listUnit.price.factor,
        //         price : listUnit.price.sale,
        //         // available : listUnit.price
        //         // available : listUnit.available.map(avail =>({
        //         //     qtyPcs : avail.qtyPcs,
        //         //     lot : avail.lot
        //         // }))
        //     }))
        //   })) 



 

        res.status(200).json({
            status: "200",
            message: "Products fetched successfully!",
            data : stock
        })
 

    } catch (error) {
        console.error(error);
        res.status(500).json({ status: '501', message: error.message })
    }
    // res.status(200).json({
    //     data:"getProductAndStock"
    // })
}

exports.addStockNew = async (req, res) => {

   const {area,saleCode,period} = req.body
   const locateData = {};
   const factorData = {};
//    console.log(area,saleCode,period)

   const areaData = await fetchArea()
   warehouse = '211'
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

    const factor = await Product.find({
      id:BalanceData[i].itemCode.trim()
    }).select('id listUnit.unit listUnit.factor')

    const factorValue = factor.listUnit.find(unit => unit.unit === 'CTN').factor;





    // console.log('factor', factor)

    for (let j = 0; j < locate.length; j++) {

      locateData[BalanceData[i].itemCode.trim()].push({
        location: locate[j].location.trim(),
        lot: locate[j].lot,
        itemOnHand: locate[j].itemOnHand,
        itemallocated: locate[j].itemallocated, // Assuming promotionName is a property of PromotionData
        factor: factorValue 
      })
    }
    console.log('test',locateData)
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
data = []

// console.log("stocks",stocks)
// console.log("stocks", JSON.stringify(stocks, null, 2));

// stocks




const productDetail = await Product.find({
    id:{ $in: productIds },
    // listUnit: { $elemMatch: { unit: "CTN" } }


}).select('id listUnit.unit listUnit.factor')

const productFactors = productDetail.map(product => {
    const ctnUnit = product.listUnit.find(unit => unit.unit === "CTN");
    return {
      id: product.id,
      factor: ctnUnit ? ctnUnit.factor : null // หรือ default ค่าอื่นเช่น 1
    };
  });


if (areaData) {
  areaData.forEach((area) => {
      // ค้นหาสินค้าในสต็อกตามคลังสินค้า
      const productID = stocks.filter(item => item.warehouse === area.warehouse);

      let listProduct = [];

      // ถ้า productID ไม่ว่าง และมีสินค้าในสต็อก
      if (productID.length > 0) {
          // ใช้ map เพื่อดึง itemCode จากแต่ละสินค้าที่ตรงกัน
          listProduct = productID.map(product => {
              const lot = product.lot;
              const productId = product.itemCode;
              // const factor = factorMap[productId];

              let ctn = 0;


              return {
                  productId: productId,
                  qtyPcs: "qtyPcs",
                  qtyCtn: "qtyCtn",
                  available: lot       
                  
              };
          });
      }

      data.push({
          area: area.area,
          saleCode: "saleCode",
          period: period,
          warehouse: area.warehouse,
          listProduct: listProduct
      });
  });
}







// const mergedData = stocks.map((stock) => {
//     const area = areaData.find(item => item.coNo === stock.coNo);
  
//     // สร้าง itemCode เป็นอาเรย์เพื่อเก็บ itemCode
//     let itemCodes = [];
//     if (area) {
//         itemCodes.push(stock.itemCode);  // ถ้าตรงกันก็เก็บ itemCode ลงในอาเรย์
//     }

//     return {
//         area: area ? area.area : null,  // ถ้าเจอ area ก็ให้ใช้ area, ถ้าไม่เจอก็ให้เป็น null
//         itemCode: itemCodes,  // เก็บ itemCode ในอาเรย์
//         ...stock  // รวมข้อมูล stock ทั้งหมด
//     };
// });







        // console.log("sdagds",areaData)


        res.status(200).json({
            data: data,
            // data2: stocksWarehouse,  // ข้อมูล areaData
            ttest: "productIDs" // ค่าของ ttest
          });
} 