const { Stock } = require('../../models/cash/stock')
const { Product } = require('../../models/cash/product')
const { getStockMovement } = require('../../utilities/movement')

const  stockModel  = require('../../models/cash/stock')
const  productModel  = require('../../models/cash/product')
const { getModelsByChannel } = require('../../middleware/channel')



const getStockAvailable = async (area, period,channel,res) => {


  const { Product } = getModelsByChannel(channel, res, productModel)
  const { Stock } = getModelsByChannel(channel, res, stockModel)

  const stock = await Stock.findOne({ area, period }).lean()
  if (!stock) return []

  const netStock = {}
  stock.listProduct.forEach(item => {
    const { productId, available } = item
    const baseQty = (available || []).reduce(
      (sum, lot) => sum + (lot.qtyPcs || 0),
      0
    )
    netStock[productId] = baseQty
  })
  // คำนวณสินค้าที่มีอยู่ใน baseQty
  // console.log(JSON.stringify(netStock, null, 2));

  const stockMovements = await getStockMovement(area, period,channel,res)
  if (stockMovements && stockMovements.length) {
    stockMovements.forEach(record => {
      // console.log("record",record)
      const { type, listProduct } = record
      // console.log("listProduct",listProduct)
      listProduct.forEach(item => {
        const { product, qtyPcs, condition } = item

        
        if (!product || !product.id) return
        if (!(product.id in netStock)) {
          netStock[product.id] = 0
        }
        if (['change', 'sale', 'give'].includes(type)) {
          netStock[product.id] -= qtyPcs
        } else if (
          type === 'receive' ||
          (type === 'refund' && condition === 'good')
        ) {
          netStock[product.id] += qtyPcs
        }
      })
    })
  }

  const allProductIds = Object.keys(netStock)
  // console.log("netStock",Object.keys(netStock))
  const productDetails = await Product.find({
    id: { $in: allProductIds }
  }).lean()

  const productDetailsMap = {}
  productDetails.forEach(prod => {
    productDetailsMap[prod.id] = prod
  })
  // console.log(productDetailsMap)
  const products = allProductIds
    .map(productId => {
      const finalQty = Math.max(netStock[productId], 0)
      if (finalQty === 0) return null

      const productInfo = productDetailsMap[productId] || {}
      let remainingPcs = finalQty
      const sortedUnits = [...(productInfo.listUnit || [])].sort(
        (a, b) => b.factor - a.factor
      )
      const availableUnits = sortedUnits.map(unit => {
        const factor = Number(unit.factor) || 1
        const qty = Math.floor(remainingPcs / factor)
        remainingPcs %= factor
        return {
          unit: unit.unit,
          name: unit.name,
          qty
        }
      })

      return {
        product: {
          id: productId,
          name: productInfo.name || '',
          group: productInfo.group || '',
          brand: productInfo.brand || '',
          size: productInfo.size || '',
          flavour: productInfo.flavour || ''
        },
        qtyPcs: finalQty,
        available: availableUnits
      }
    })
    .filter(Boolean)

  return [
    {
      area: stock.area,
      saleCode: stock.saleCode,
      listProduct: products
    }
  ]
}

module.exports = { getStockAvailable }
