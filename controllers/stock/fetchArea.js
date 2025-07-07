const { Warehouse,Locate,Balance } = require('../../models/cash/master')
const errorEndpoint = require('../../middleware/errorEndpoint')

const currentFilePath = path.basename(__filename)


const { Op } = require("sequelize");

exports.fetchArea = async (req,res) => {
    try {
      // const { warehouseCode } = req.body
      const WarehouseData = await Warehouse.find({
        where: {
          coNo: 410,
        //   warehouse: warehouseCode
        }
      })
      const areaData = {
        coNo: WarehouseData.coNo,
        warehouse: WarehouseData.warehouseName,
        area: String(WarehouseData.warehouseName).slice(0, 5)
      }
      console.log("areaData",areaData)
      return areaData
    } catch (error) {
      // Enhanced error handling
      throw errorEndpoint(currentFilePath, 'fetchArea', error)
    }
  }