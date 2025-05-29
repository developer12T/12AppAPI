exports.getSummarybyArea = async (req, res) => {
  try {
    const { period, year, type, zone, area } = req.query


    let query = {}
    // if (zone) query.zone = zone;
    if (area) query.area2 = area;
    if (zone) query.area = zone;


    const channel = req.headers['x-channel']; // 'credit' or 'cash'

    const { Route } = getModelsByChannel(channel, res, routeModel);

    if (!period) {
      return res.status(404).json({
        status: 404,
        message: "period is require"
      })
    }

    if (type == 'route') {
      const modelRouteValue = await Route.aggregate([
        { $match: { period } },
        { $project: { area: 1, day: 1, listStore: 1 } },
        { $unwind: { path: "$listStore", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$listStore.listOrder", preserveNullAndEmptyArrays: true } },

        {
          $addFields: {
            convertedDate: {
              $dateToString: {
                format: "%Y-%m-%dT%H:%M:%S",
                date: "$listStore.listOrder.date",
                timezone: "Asia/Bangkok"
              }
            },
            month: { $month: "$listStore.listOrder.date" },
            area2: { $substrCP: ["$area", 0, 2] }
          }
        },
        {
          $match: {
            $expr: {
              $cond: {
                if: { $eq: [year, null] },
                then: true,
                else: {
                  $eq: [
                    { $substr: ["$convertedDate", 0, 4] },
                    { $toString: year }
                  ]
                }
              }
            }
          }
        },
        { $match: query},

        {
          $lookup: {
            from: "orders",
            localField: "listStore.listOrder.orderId",
            foreignField: "orderId",
            as: "orderDetails"
          }
        },
        { $unwind: { path: "$orderDetails", preserveNullAndEmptyArrays: true } },

        {
          $group: {
            _id: { area: "$area2", month: "$month" },
            totalAmount: { $sum: "$orderDetails.total" }
          }
        },
        {
          $project: {
            area: "$_id.area",
            month: "$_id.month",
            totalAmount: 1,
            _id: 0
          }
        },

        { $sort: { area: 1, month: 1 } }
      ]);

      // console.log("modelRouteValue", modelRouteValue)

      const haveArea = [...new Set(modelRouteValue.map(i => i.area))];
      otherModelRoute = await Route.aggregate([
        {
          $match: {
            period: period,
            area: { $nin: haveArea }
          }
        },
        { $project: { area: 1, day: 1, listStore: 1 } },
        { $unwind: { path: "$listStore", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$listStore.listOrder", preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            month: { $month: "$listStore.listOrder.date" },
            area2: { $substrCP: ["$area", 0, 2] }
          }
        },
        {
          $lookup: {
            from: "orders",
            localField: "listStore.listOrder.orderId",
            foreignField: "orderId",
            as: "orderDetails"
          }
        },
        { $unwind: { path: "$orderDetails", preserveNullAndEmptyArrays: true } },
        { $match:  query },
        {
          $group: {
            _id: { area: "$area2", month: "$month" }, // ✅ group ด้วย area2 + month
            totalAmount: { $sum: "$orderDetails.total" }
          }
        },
        {
          $project: {
            area: "$_id.area",
            month: "$_id.month",
            totalAmount: 1,
            _id: 0
          }
        },
        { $sort: { area: 1, month: 1 } }
      ]);

      console.log("otherModelRoute",otherModelRoute)


      if (modelRouteValue.length === 0) {
        return res.status(404).json({
          status: 404,
          message: 'Not Found Route This period'
        })
      }

      // console.log("modelRouteValue",modelRouteValue,"otherModelRoute",otherModelRoute)


      modelRoute = [...modelRouteValue, ...otherModelRoute];
      const areaList = [...new Set(modelRoute.map(item => item.area))].sort();

      const data = areaList.map(area => {
        const filtered = modelRoute.filter(item => item.area === area);
        const filledMonths = Array.from({ length: 27 }, (_, i) => {
          const month = String(i + 1).padStart(2, '0');
          const found = filtered.find(item => String(item.month).padStart(2, '0') === month);
          return found || {
            totalAmount: 0,
            area,
            month
          };
        });

        return {
          area,
          summary: filledMonths.map(item => item.totalAmount)
        };
      });
      res.status(200).json({
        status: 200,
        message: 'Success',
        data: data
      })
    }
    if (type == 'year') {
      const modelRouteValue = await Route.aggregate([
        { $match: { period: period } },
        { $project: { area: 1, day: 1, listStore: 1 } },
        { $unwind: { path: "$listStore", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$listStore.listOrder", preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            convertedDate: {
              $dateToString: {
                format: "%Y-%m-%dT%H:%M:%S",
                date: "$listStore.listOrder.date",
                timezone: "Asia/Bangkok"
              }
            },
            month: { $month: "$listStore.listOrder.date" },
            area2: { $substrCP: ["$area", 0, 2] }
          }
        },
        {
          $match: {
            $expr: {
              $cond: {
                if: { $eq: [year, null] },
                then: true,
                else: {
                  $eq: [
                    { $substr: [{ $toString: "$convertedDate" }, 0, 4] },
                    { $toString: year }
                  ]
                }
              }
            }
          }
        },
        { $match: query},
        {
          $lookup: {
            from: "orders",
            localField: "listStore.listOrder.orderId",
            foreignField: "orderId",
            as: "orderDetails"
          }
        },
        { $unwind: { path: "$orderDetails", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: { area: "$area2", month: "$month" },
            totalAmount: { $sum: "$orderDetails.total" }
          }
        },
        {
          $project: {
            area: "$_id.area",
            day: "$_id.month", // 👈 คุณอาจจะเปลี่ยนเป็น 'month' แทน 'day' เพื่อความชัดเจน
            totalAmount: 1,
            _id: 0
          }
        },
        { $sort: { area: 1, "day": 1 } } // sort ตาม area และ month
      ]);


      const haveArea = [...new Set(modelRouteValue.map(i => i.area))];
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
          $addFields: {
            convertedDate: {
              $dateToString: {
                format: "%Y-%m-%dT%H:%M:%S",
                date: "$listStore.listOrder.date",
                timezone: "Asia/Bangkok"
              }
            },
            month: { $month: "$listStore.listOrder.date" },
            area2: { $substrCP: ["$area", 0, 2] }
          }
        },
        { $match: query},
        {
          $group: {
            _id: { area: "$area2", day: "$month" },
            totalAmount: { $sum: "$orderDetails.total" }
          }
        },
        {
          $project: {
            area: "$_id.area",
            day: "$_id.month",
            totalAmount: 1,
            _id: 0
          }
        },
        { $sort: { area: 1, "day": 1 } }
      ]);

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

        const filledMonths = Array.from({ length: 12 }, (_, i) => {
          const month = String(i + 1).padStart(2, '0');
          const found = filtered.find(item => String(item.day).padStart(2, '0') === month);
          return found || {
            totalAmount: 0,
            area,
            day: month
          };
        });

        return {
          area,
          summary: filledMonths.map(item => item.totalAmount)
        };
      });
      res.status(200).json({
        status: 200,
        message: 'Success',
        data: data
      })
    }
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Internal server error.' })
  }
}