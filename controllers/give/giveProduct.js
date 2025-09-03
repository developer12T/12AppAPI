// const { Product } = require('../../models/cash/product')
// const { Store } = require('../../models/cash/store')
// const { Givetype } = require('../../models/cash/give')

const productModel = require('../../models/cash/product')
const storeModel = require('../../models/cash/store')
const givetypeModel = require('../../models/cash/give')
const { getModelsByChannel } = require('../../middleware/channel')

async function getProductGive(giveId, area, channel, res) {
  try {
    const { Givetype } = getModelsByChannel(channel, res, givetypeModel)
    const { Product } = getModelsByChannel(channel, res, productModel)

    const giveType = await Givetype.findOne({ giveId }).lean()

    if (!giveType) {
      return []
    }

    const conditions = giveType.conditions

    if (!conditions || conditions.length === 0) {
      return []
    }

    let unitFilter = {}


    let products = []

    for (const condition of conditions) {
      let productQuery = { statusSale: 'Y' }
      // ✅ ถ้าเจอ productId (ไม่ว่าง/มีค่า) ให้ข้าม loop ไป
      if (condition.productId && condition.productId.length > 0) {

        productQuery.id = { $in: condition.productId }

        const dataProduct = await Product.aggregate([{ $match: productQuery },
        {
          $set: {
            listUnit: {
              $filter:
                { input: '$listUnit', as: 'u', cond: { $in: ['$$u.unit', condition.productUnit] } }
            },
            qtyPro: condition.productQty
          }
        }]).exec()
        products.push(...dataProduct)

        continue
      }



      if (condition.productGroup?.length > 0) {
        productQuery.group = { $in: condition.productGroup }
      }
      if (condition.productBrand?.length > 0) {
        productQuery.brand = { $in: condition.productBrand }
      }
      if (condition.productSize?.length > 0) {
        productQuery.size = { $in: condition.productSize }
      }
      if (condition.productFlavour?.length > 0) {
        productQuery.flavour = { $in: condition.productFlavour }
      }

      if (condition.productUnit?.length > 0) {
        unitFilter[condition.productUnit.join(',')] = condition.productUnit
      }

      // console.log(unitFilter)



      const dataProduct = await Product.aggregate([{ $match: productQuery },
      {
        $set: {
          listUnit: {
            $filter:
              { input: '$listUnit', as: 'u', cond: { $in: ['$$u.unit', condition.productUnit] } }
          },
          qtyPro: condition.productQty
        }
      }]).exec()
      products.push(...dataProduct) // กัน nested array
    }


    //  products = await Product.find(productQuery).lean()
    // console.log('products', products)


    return products
  } catch (error) {
    console.error('Error fetching products by give type:', error)
    return []
  }
}

async function getStoreGive(giveId, area, channel, res) {
  try {
    const { Givetype } = getModelsByChannel(channel, res, givetypeModel)
    const { Store } = getModelsByChannel(channel, res, storeModel)

    const giveType = await Givetype.findOne({ giveId }).lean()
    if (!giveType) {
      return []
    }

    const applicableTo = giveType.applicableTo

    // console.log(applicableTo)

    const hasApplicableFilters = Object.values(applicableTo).some(
      arr => arr.length > 0
    )

    if (!hasApplicableFilters) {
      return await Store.find({ area })
        .select('storeId name address type zone area')
        .lean()
    }

    let storeQuery = { $and: [{ area }] }

    if (applicableTo.store.length > 0) {
      storeQuery.$and.push({ storeId: { $in: applicableTo.store } })
    }
    if (applicableTo.typeStore.length > 0) {
      storeQuery.$and.push({ type: { $in: applicableTo.typeStore } })
    }
    if (applicableTo.zone.length > 0) {
      storeQuery.$and.push({ zone: { $in: applicableTo.zone } })
    }
    if (applicableTo.area.length > 0) {
      storeQuery.$and.push({ area: { $in: applicableTo.area } })
    }

    const stores = await Store.find(storeQuery)
      .select('storeId name address type zone area')
      .lean()

    if (stores.length === 0) {
      return []
    }

    return stores
  } catch (error) {
    console.error('Error fetching stores by give type:', error)
    return []
  }
}

module.exports = { getProductGive, getStoreGive }
