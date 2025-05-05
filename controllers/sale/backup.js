exports.getSummarybyArea = async (req, res) => {

    const { period, year } = req.query
    // console.log(year)
    // year = Number(yearQuery)
    // let modelRoute = [];
    // if ( !period ) {
    //   return res.status(404).json({
    //     status:404,
    //     message:'period is require'
    // })
    // }
  
    // if ( !year ) {
    //   return res.status(404).json({
    //     status:404,
    //     message:'year is require'
    // })
    // }
  
    if (!period && year) {
  
      // console.log(period)
      const modelRouteValue = await Order.aggregate([
  
        {
          $addFields: {
            orderCreatedYear: {
              $year: {
                date: "$createdAt",
                timezone: "Asia/Bangkok"
              }
            }
          }
        },
        {
          $match: {
            orderCreatedYear: Number(year)
          }
        },
  
  
        {
          $lookup: {
            from: "routes",
            let: { orderId: "$orderId" },  // เอาค่า orderId จากฝั่ง orders
            pipeline: [
              { $unwind: "$listStore" },
              { $unwind: "$listStore.listOrder" },
              {
                $match: {
                  $expr: { $eq: ["$listStore.listOrder.orderId", "$$orderId"] }  // ใช้ $expr + $$variable
                }
              }
            ],
            as: "routesDetails"
          }
        },
        { $unwind: "$routesDetails" },
        {
          $group: {
            _id: {
              area: "$routesDetails.area",
              day: "$routesDetails.day"
            },
            totalAmount: { $sum: "$total" }
          }
        },
  
        {
          $project: {
            area: "$_id.area",
            day: "$_id.day",
            totalAmount: 1,
            _id: 0
          }
        }
      ])
  
      // console.log("modelRouteValue",modelRouteValue)
  
      const haveArea = [...new Set(modelRouteValue.map(i => i.area))];
  
      // console.log(haveArea)
      otherModelRoute = await Route.aggregate([
        {
          $match: {
            // period: period,
            area: { $nin: haveArea }  // เลือกเฉพาะ area ที่ไม่อยู่ใน haveArea
          }
        },
        { $project: { area: 1, day: 1, listStore: 1 } },
  
        { $unwind: { path: "$listStore", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$listStore.listOrder", preserveNullAndEmptyArrays: true } },
  
        {
          $lookup: {
            from: "orders",
            localField: "listStore.listOrder.orderId",
            foreignField: "orderId",
            as: "orderDetails",
          }
        },
  
        { $unwind: { path: "$orderDetails", preserveNullAndEmptyArrays: true } },
  
        // {
        //   $addFields: {
        //     orderCreatedYear: {
        //       $year: {
        //         date: "$orderDetails.createdAt",
        //         timezone: "Asia/Bangkok"
        //       }
        //     }
        //   }
        // },
        // {
        //   $match: {
        //     orderCreatedYear: Number(year)
        //   }
        // },
  
  
        {
          $group: {
            _id: { area: "$area", day: "$day" },  // Group by area and day
            totalAmount: { $sum: "$orderDetails.total" }  // Sum the total from orderDetails
          }
        },
  
        {
          $project: {
            area: "$_id.area",   // Project area
            day: "$_id.day",     // Project day
            totalAmount: 1,      // Include totalAmount in the output
            _id: 0               // Exclude _id field from the result
          }
        },
        { $sort: { area: 1, day: 1 } }
  
      ]);
  
      // console.log(otherModelRoute)
  
      if (modelRouteValue.length === 0) {
        return res.status(404).json({
          status: 404,
          message: 'Not Found Route This period'
        })
      }
  
      modelRoute = [...modelRouteValue, ...otherModelRoute];
  
      const areaList = [...new Set(modelRoute.map(item => item.area))].sort();
  
      const data = areaList.map(area => {
        const filtered = modelRoute.filter(item => item.area === area);
  
        const filledDays = Array.from({ length: 27 }, (_, i) => {
          const day = String(i + 1).padStart(2, '0');
          const found = filtered.find(item => item.day === day);
  
          return found || {
            totalAmount: 0,
            area: area,
            day: day,
          };
        })
          ;
  
        modelRoute = [...modelRouteValue, ...otherModelRoute];
  
  
  
        return {
          area: area,
          summary: filledDays.map(item => item.totalAmount),
        };
      });
  
      res.status(200).json({
        status: 200,
        message: 'Success',
        data: data
  
      })
  
    }
  
    else if (period && !year) {
      const modelRouteValue = await Route.aggregate([
  
        { $match: { period: period } },
        { $project: { area: 1, day: 1, listStore: 1 } },
        { $unwind: { path: "$listStore", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$listStore.listOrder", preserveNullAndEmptyArrays: true } },
        {
  
          $lookup: {
  
            from: "orders",
  
            localField: "listStore.listOrder.orderId",
  
            foreignField: "orderId",
  
            as: "orderDetails",
  
          }
  
        },
        { $unwind: { path: "$orderDetails", preserveNullAndEmptyArrays: true } },
        // แปลง createdAt เป็น Bangkok Time แล้วกรองปี 2025
        {
          $group: {
            _id: { area: "$area", day: "$day" },
            totalAmount: { $sum: "$orderDetails.total" }
          }
        },
        {
          $project: {
            area: "$_id.area",
            day: "$_id.day",
            totalAmount: 1,
            _id: 0
          }
        },
        { $sort: { area: 1, day: 1 } }
      ]);
  
      const haveArea = [...new Set(modelRouteValue.map(i => i.area))];
  
      console.log(JSON.stringify(modelRouteValue, null, 2));
  
  
      otherModelRoute = await Route.aggregate([
        {
          $match: {
            period: period,
            area: { $nin: haveArea }  // เลือกเฉพาะ area ที่ไม่อยู่ใน haveArea
          }
        },
        { $project: { area: 1, day: 1, listStore: 1 } },
  
        { $unwind: { path: "$listStore", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$listStore.listOrder", preserveNullAndEmptyArrays: true } },
  
        {
          $lookup: {
            from: "orders",
            localField: "listStore.listOrder.orderId",
            foreignField: "orderId",
            as: "orderDetails",
          }
        },
  
        { $unwind: { path: "$orderDetails", preserveNullAndEmptyArrays: true } },
  
  
        {
          $group: {
            _id: { area: "$area", day: "$day" },  // Group by area and day
            totalAmount: { $sum: "$orderDetails.total" }  // Sum the total from orderDetails
          }
        },
  
        {
          $project: {
            area: "$_id.area",   // Project area
            day: "$_id.day",     // Project day
            totalAmount: 1,      // Include totalAmount in the output
            _id: 0               // Exclude _id field from the result
          }
        },
        { $sort: { area: 1, day: 1 } }
  
      ]);
  
  
      // console.log(modelRouteValue)
  
  
  
      if (modelRouteValue.length === 0) {
        return res.status(404).json({
          status: 404,
          message: 'Not Found Route This period'
        })
      }
  
      modelRoute = [...modelRouteValue, ...otherModelRoute];
  
      const areaList = [...new Set(modelRoute.map(item => item.area))].sort();
  
      const data = areaList.map(area => {
        const filtered = modelRoute.filter(item => item.area === area);
  
        const filledDays = Array.from({ length: 27 }, (_, i) => {
          const day = String(i + 1).padStart(2, '0');
          const found = filtered.find(item => item.day === day);
  
          return found || {
            totalAmount: 0,
            area: area,
            day: day,
          };
        });
  
  
        return {
          area: area,
          summary: filledDays.map(item => item.totalAmount),
        };
      });
  
  
      res.status(200).json({
        status: 200,
        message: 'Success',
        data: data
  
      })
    }
  
  
    // console.log(year)
    else if (period && year) {
      const modelRouteValue = await Route.aggregate([
  
        { $match: { period: period } },
        { $project: { area: 1, day: 1, listStore: 1 } },
        { $unwind: { path: "$listStore", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$listStore.listOrder", preserveNullAndEmptyArrays: true } },
        {
  
          $lookup: {
  
            from: "orders",
  
            localField: "listStore.listOrder.orderId",
  
            foreignField: "orderId",
  
            as: "orderDetails",
  
          }
  
        },
        { $unwind: { path: "$orderDetails", preserveNullAndEmptyArrays: true } },
        // แปลง createdAt เป็น Bangkok Time แล้วกรองปี 2025
        {
          $match: {
            $expr: {
              $eq: [
                { $year: { date: "$orderDetails.createdAt", timezone: "Asia/Bangkok" } },
                Number(year) // year ควรเป็น 2025 หรือปีที่ต้องการ
              ]
            }
          }
        },
        {
          $group: {
            _id: { area: "$area", day: "$day" },
            totalAmount: { $sum: "$orderDetails.total" }
          }
        },
        {
          $project: {
            area: "$_id.area",
            day: "$_id.day",
            totalAmount: 1,
            orderCreatedYear:1,
            _id: 0
          }
        },
        { $sort: { area: 1, day: 1 } }
      ]);
  
      const haveArea = [...new Set(modelRouteValue.map(i => i.area))];
  
      console.log(modelRouteValue)
  
      otherModelRoute = await Route.aggregate([
        {
          $match: {
            period: period,
            area: { $nin: haveArea }  // เลือกเฉพาะ area ที่ไม่อยู่ใน haveArea
          }
        },
        { $project: { area: 1, day: 1, listStore: 1 } },
  
        { $unwind: { path: "$listStore", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$listStore.listOrder", preserveNullAndEmptyArrays: true } },
  
        {
          $lookup: {
            from: "orders",
            localField: "listStore.listOrder.orderId",
            foreignField: "orderId",
            as: "orderDetails",
          }
        },
  
        { $unwind: { path: "$orderDetails", preserveNullAndEmptyArrays: true } },
  
  
        {
          $group: {
            _id: { area: "$area", day: "$day" },  // Group by area and day
            totalAmount: { $sum: "$orderDetails.total" }  // Sum the total from orderDetails
          }
        },
  
        {
          $project: {
            area: "$_id.area",
            day: "$_id.day",
            totalAmount: 1,
            orderCreatedYear: 1,
            createdAt: "$orderDetails.createdAt", // ดูเวลาจริง ๆ ด้วย
            _id: 0
          }
        }
  ,      
        { $sort: { area: 1, day: 1 } }
  
      ]);
  
  
      // console.log(modelRouteValue)
  
  
  
      if (modelRouteValue.length === 0) {
        return res.status(404).json({
          status: 404,
          message: 'Not Found Route This period'
        })
      }
  
      modelRoute = [...modelRouteValue, ...otherModelRoute];
  
      const areaList = [...new Set(modelRoute.map(item => item.area))].sort();
  
      const data = areaList.map(area => {
        const filtered = modelRoute.filter(item => item.area === area);
  
        const filledDays = Array.from({ length: 27 }, (_, i) => {
          const day = String(i + 1).padStart(2, '0');
          const found = filtered.find(item => item.day === day);
  
          return found || {
            totalAmount: 0,
            area: area,
            day: day,
          };
        });
  
  
        return {
          area: area,
          summary: filledDays.map(item => item.totalAmount),
        };
      });
  
  
      res.status(200).json({
        status: 200,
        message: 'Success',
        data: data
  
      })
    }
  }







exports.getSummarybyGroup = async (req, res) => {

    const { zone,group,period } = req.body 

    const year = parseInt(period.slice(0, 4));
    const month = period.slice(4, 6)

    const start = DateTime.fromObject({ year, month, day: 1 }, { zone: 'Asia/Bangkok' }).toUTC().toJSDate();
    const end = DateTime.fromObject({ year, month, day: 1 }, { zone: 'Asia/Bangkok' }).plus({ months: 1 }).toUTC().toJSDate();

    const modelOrder = await Order.aggregate([
      { 
        $match: { 
          "store.zone": zone,  // กรองตาม zone
          createdAt: { $gte: start, $lt: end },  
        } 
      },
      { $unwind: { path: "$listProduct", preserveNullAndEmptyArrays: false } },
      { $match: { "listProduct.groupCode": group } },
      {
        $group: {
          _id: {
            size: "$listProduct.size",
            flavour: "$listProduct.flavourCode",
            area: "$store.area"
          },
          qty: { $sum: "$listProduct.qty" }
        }
      },
      {
        $group: {
          _id: "$_id.size",
          area: { $first: "$_id.area" },
          entries: {
            $push: {
              k: "$_id.flavour",
              v: "$qty"
            }
          },
          total: { $sum: "$qty" }
        }
      },      
      {
        $addFields: {
          entriesObject: { $arrayToObject: "$entries" }
        }
      },
    
      {
        $addFields: {
          fullObject: {
            $mergeObjects: [
              "$entriesObject",
              {
                $arrayToObject: [
                  [
                    {
                      k: { $concat: ["รวม", "$_id"] },
                      v: "$total"
                    }
                  ]
                ]
              },
              {
                area: "$area" 
              }
            ]
          }
        }
      }
,      
    
      {
        $replaceRoot: {
          newRoot: {
            $arrayToObject: [[
              { k: "$_id", v: "$fullObject" }
            ]]
          }
        }
      },


    ]);
    console.log(modelOrder)
    if ( modelOrder.length == 0 ){
      return res.status(404).json({
        status:404,
        message:"Not Found Order"
      })
    }




    const sizeKey = Object.keys(modelOrder[0])[0];  
    const area = modelOrder[0][sizeKey].area;  

    const modelProduct = await Product.aggregate([
      { $match: { groupCode: group } },
          {
        $group: {

          _id: "$size", 
          entries: {
            $push: {
              k: "$flavourCode",   
              v: 0      
            }
          },
          total: { $sum: "$value" } 
        }
      },
    
      {
        $addFields: {
          entriesObject: { $arrayToObject: "$entries" }
        }
      },
    
      {
        $addFields: {
          fullObject: {
            $mergeObjects: [
              "$entriesObject",
              {
                $arrayToObject: [
                  [
                    {
                      k: { $concat: ["รวม", "$_id"] }, // ต่อข้อความ "รวม" + ขนาด
                      v: "$total"
                    }
                  ]
                ]
              }
            ]
          }
        }
      }
,      
    
      {
        $replaceRoot: {
          newRoot: {
            $arrayToObject: [[
              { k: "$_id", v: "$fullObject" }
            ]]
          }
        }
      },
    
    ]);
    
  const orderMap = new Map();

  modelOrder.forEach(obj => {
    const key = Object.keys(obj)[0].trim(); // เช่น '850 G'
    orderMap.set(key, obj[key]); // key: '850 G', value: { SK: 4, รวม850 G: 4, area: 'BE215' }
  });
  // console.log(orderMap,"orderMap")
  // อัปเดต modelProduct ตาม orderMap
  modelProduct.forEach(productObj => {
    const sizeKey = Object.keys(productObj)[0]; // เช่น '850 G'
    const trimmedKey = sizeKey.trim();

    const matchedOrder = orderMap.get(trimmedKey);
    if (matchedOrder) {
      // เข้าถึง object ด้านในของ modelProduct เช่น productObj['850 G']
      const innerProduct = productObj[sizeKey];

      Object.keys(matchedOrder).forEach(field => {
        if (innerProduct.hasOwnProperty(field)) {
          innerProduct[field] = matchedOrder[field];
        }
      });
    }
  });

  const data = {
    zone: area,  
    list: [...modelProduct] 
  };

  // const io = getSocket()
  // io.emit('sale_getSummarybyGroup', {
  //   status:200,
  //   message:'Success',
  //   data:data
  // })

    res.status(200).json({
      status:200,
      message:'Success',
      data:data
    })
}