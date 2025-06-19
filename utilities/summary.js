const { Product } = require('../models/cash/product')
const { Store } = require('../models/cash/store')
const { User } = require('../models/cash/user')

const productModel = require('../models/cash/product')
const storeModel = require('../models/cash/store')
const userModel = require('../models/cash/user')
const { getModelsByChannel } = require('../middleware/channel')
const {
  applyPromotion,
} = require('../controllers/promotion/calculate')

async function summaryOrder(cart, channel, res) {
  try {
    if (!cart) {
      throw new Error('Cart data is required')
    }

    const { Store, TypeStore } = getModelsByChannel(channel, res, storeModel);
    // console.log(cart.storeId, cart.area)
    const storeData = await Store.findOne({ storeId: cart.storeId, area: cart.area }).lean() || {}

    const store = storeData
      ? {
        _id: storeData._id,
        storeId: storeData.storeId,
        name: storeData.name || '',
        taxId: storeData.taxId || '',
        tel: storeData.tel || '',
        route: storeData.route || '',
        storeType: storeData.type || '',
        typeName: storeData.typeName || '',
        address: storeData.address || '',
        subDistrict: storeData.subDistrict || '',
        district: storeData.district || '',
        province: storeData.province || '',
        zone: storeData.zone || '',
        area: storeData.area || '',
      }
      : {}
    const productIds = [
      ...cart.listProduct.map(p => p.id),
      ...(cart.listPromotion
        ? cart.listPromotion.flatMap(promo => promo.listProduct.map(p => p.id))
        : [])
    ]

    const { Product } = getModelsByChannel(channel, res, productModel);

    const productDetails = await Product.find({
      id: { $in: productIds }
    }).lean()
    // หา Product ที่อยู่ใน อาร์เรย์ productIds แล้วเอาแต่ id

    let enrichedProducts = [] // ประกาศตัวแปรไว้ก่อน
    // if (changePromotionStatus == 0) {
    // console.log('changePromotionStatus = 0', changePromotionStatus);
    enrichedProducts = cart.listProduct.map(cartItem => {
      const productInfo = productDetails.find(p => p.id === cartItem.id) || {}
      const unitData =
        productInfo.listUnit?.find(u => u.unit === cartItem.unit) || {}
      const factor = parseInt(unitData?.factor, 10) || 1
      // console.log("factor",factor);
      const qtyPcs = cartItem.qty * factor
      const totalPrice = cartItem.qty * cartItem.price
      return {
        id: cartItem.id,
        // lot: cartItem.lot,
        name: cartItem.name,
        groupCode: productInfo.groupCode || '',
        group: productInfo.group || '',
        brandCode: productInfo.brandCode || '',
        brand: productInfo.brand || '',
        size: productInfo.size || '',
        flavourCode: productInfo.flavourCode || '',
        flavour: productInfo.flavour || '',
        qty: cartItem.qty,
        unit: cartItem.unit,
        unitName: unitData.name || '',
        price: cartItem.price,
        total: totalPrice,
        qtyPcs
      }
    })

    const enrichedPromotions =
      cart.listPromotion?.map(promo => ({
        ...promo,
        listProduct: promo.listProduct.map(promoProduct => {
          const productInfo =
            productDetails.find(p => p.id === promoProduct.id) || {}
          const unitData =
            productInfo.listUnit?.find(u => u.unit === promoProduct.unit) || {}
          const factor = parseInt(unitData?.factor, 10) || 1
          const qtyPcs = promoProduct.qty * factor

          return {
            ...promoProduct,
            // test: promo.id,
            // test: 'dawdaw',
            qtyPcs
          }
        })
      })) || []


    return {
      type: cart.type ,
      store,
      shipping: [],
      listProduct: enrichedProducts,
      // listRefund: [],
      listPromotion: enrichedPromotions,
      listQuota: cart.listQuota,
      total: parseFloat(cart.total.toFixed(2)),
      subtotal: parseFloat(cart.total.toFixed(2)),
      discount: 0,
      discountProduct: 0,
      vat: parseFloat((cart.total - cart.total / 1.07).toFixed(2)),
      totalExVat: parseFloat((cart.total / 1.07).toFixed(2))
    }
    // }


    // console.log(enrichedProducts) // สามารถใช้งาน enrichedProducts ได้

    // console.log('enrichedPromotions',enrichedProducts)
  } catch (error) {
    console.error('Error transforming cart data:', error.message)
    return null
  }
}

async function summaryWithdraw(cart, channel, res) {
  try {
    if (!cart) {
      throw new Error('Cart data is required')
    }
    const { Product } = getModelsByChannel(channel, res, productModel);

    const productIds = cart.listProduct.map(p => p.id)
    const productDetails = await Product.find({
      id: { $in: productIds }
    }).lean()

    let totalQty = 0
    const enrichedProducts = cart.listProduct.map(cartItem => {
      const productInfo = productDetails.find(p => p.id === cartItem.id) || {}
      const unitData =
        productInfo.listUnit?.find(u => u.unit === cartItem.unit) || {}
      const qtyPcs = unitData?.factor || cartItem.qty
      const totalPrice = cartItem.qty * cartItem.price
      totalQty += cartItem.qty

      return {
        id: cartItem.id,
        name: cartItem.name,
        group: productInfo.group || '',
        brand: productInfo.brand || '',
        size: productInfo.size || '',
        flavour: productInfo.flavour || '',
        qty: cartItem.qty,
        unit: cartItem.unit,
        unitName: unitData.name,
        price: cartItem.price,
        total: totalPrice,
        qtyPcs: qtyPcs * cartItem.qty
      }
    })

    return {
      type: cart.type,
      listProduct: enrichedProducts,
      total: totalQty,
      created: cart.created,
      updated: cart.updated
    }
  } catch (error) {
    console.error('Error transforming cart data:', error.message)
    return null
  }
}

// async function summaryRefund (cart,channel,res) {
//   // try {
//     // if (!cart) {
//     //   throw new Error('Cart data is required')
//     // }

//     const { Store } = getModelsByChannel(channel,res,storeModel); 

//     const storeData = await Store.findOne({ storeId: cart.storeId }).lean()
//     console.log("storeData",storeData)
//     const store = storeData
//       ? {
//           storeId: storeData.storeId,
//           name: storeData.name || '',
//           taxId: storeData.taxId || '',
//           tel: storeData.tel || '',
//           route: storeData.route || '',
//           storeType: storeData.type || '',
//           typeName: storeData.typeName || '',
//           address: storeData.address || '',
//           subDistrict: storeData.subDistrict || '',
//           district: storeData.district || '',
//           province: storeData.province || '',
//           zone: storeData.zone || '',
//           area: storeData.area || ''
//         }
//       : {}

//     const productIds = [
//       ...cart.listProduct.map(p => p.id),
//       ...cart.listRefund.map(p => p.id)
//     ]

//     const { Product } = getModelsByChannel(channel,res,productModel); 


//     const productDetails = await Product.find({
//       id: { $in: productIds }
//     }).lean()

//     let totalRefund = 0
//     let totalProduct = 0

//     const enrichedProducts = cart.listProduct.map(cartItem => {
//       const productInfo = productDetails.find(p => p.id === cartItem.id) || {}
//       const unitData =
//         productInfo.listUnit?.find(u => u.unit === cartItem.unit) || {}
//       const qtyPcs = unitData?.factor || cartItem.qty
//       const totalPrice = cartItem.qty * cartItem.price
//       totalProduct += totalPrice

//       return {
//         id: cartItem.id,
//         name: cartItem.name,
//         group: productInfo.group || '',
//         brand: productInfo.brand || '',
//         size: productInfo.size || '',
//         flavour: productInfo.flavour || '',
//         qty: cartItem.qty.toFixed(),
//         unit: cartItem.unit,
//         unitName: unitData.name,
//         qtyPcs: (qtyPcs * cartItem.qty).toFixed(),
//         price: cartItem.price.toFixed(2),
//         subtotal: totalPrice.toFixed(2),
//         netTotal: totalPrice.toFixed(2)
//       }
//     })

//     const enrichedRefunds = cart.listRefund.map(refundItem => {
//       const productInfo = productDetails.find(p => p.id === refundItem.id) || {}
//       const unitData =
//         productInfo.listUnit?.find(u => u.unit === refundItem.unit) || {}
//       const qtyPcs = unitData?.factor || refundItem.qty
//       const totalRefundPrice = refundItem.qty * refundItem.price
//       totalRefund += totalRefundPrice

//       return {
//         id: refundItem.id,
//         name: refundItem.name,
//         group: productInfo.group || '',
//         brand: productInfo.brand || '',
//         size: productInfo.size || '',
//         flavour: productInfo.flavour || '',
//         qty: refundItem.qty.toFixed(),
//         unit: refundItem.unit,
//         unitName: unitData.name,
//         qtyPcs: (qtyPcs * refundItem.qty).toFixed(),
//         price: refundItem.price.toFixed(2),
//         total: totalRefundPrice.toFixed(2),
//         condition: refundItem.condition,
//         expireDate: refundItem.expireDate
//       }
//     })

//     return {
//       type: cart.type,
//       store,
//       listProduct: enrichedProducts,
//       listRefund: enrichedRefunds,
//       totalRefund: totalRefund.toFixed(2),
//       totalChange: totalProduct.toFixed(2),
//       totalExVat: ((totalProduct - totalRefund) / 1.07).toFixed(2),
//       totalVat: (
//         totalProduct -
//         totalRefund -
//         (totalProduct - totalRefund) / 1.07
//       ).toFixed(2),
//       totalNet: (totalProduct - totalRefund).toFixed(2),
//       created: cart.created,
//       updated: cart.updated
//     }
//   // } catch (error) {
//   //   console.error('Error transforming refund cart data:', error.message)
//   //   return null
//   // }
// }

async function summaryGive(cart, channel, res) {
  try {
    if (!cart) {
      throw new Error('Cart data is required')
    }
    // console.log('summaryGive', cart.storeId)
    const { Store } = getModelsByChannel(channel, res, storeModel);

    const storeData = await Store.findOne({ storeId: cart.storeId, area: cart.area }).lean()
    // console.log(storeData)
    const store = storeData
      ? {
        storeId: storeData.storeId,
        name: storeData.name || '',
        taxId: storeData.taxId || '',
        tel: storeData.tel || '',
        route: storeData.route || '',
        storeType: storeData.type || '',
        typeName: storeData.typeName || '',
        address: storeData.address || '',
        subDistrict: storeData.subDistrict || '',
        district: storeData.district || '',
        province: storeData.province || '',
        zone: storeData.zone || '',
        area: storeData.area || ''
      }
      : {}

    const productIds = cart.listProduct.map(p => p.id)
    const { Product } = getModelsByChannel(channel, res, productModel);
    const productDetails = await Product.find({
      id: { $in: productIds }
    }).lean()

    const enrichedProducts = cart.listProduct.map(cartItem => {
      const productInfo = productDetails.find(p => p.id === cartItem.id) || {}
      const unitData =
        productInfo.listUnit?.find(u => u.unit === cartItem.unit) || {}
      const qtyPcs = unitData?.factor || cartItem.qty
      const totalPrice = cartItem.qty * cartItem.price
      // console.log("cartItem",cartItem)
      return {
        id: cartItem.id,
        name: cartItem.name,
        lot: cartItem.lot,
        group: productInfo.group || '',
        brand: productInfo.brand || '',
        size: productInfo.size || '',
        flavour: productInfo.flavour || '',
        qty: cartItem.qty,
        unit: cartItem.unit,
        unitName: unitData.name,
        qtyPcs: qtyPcs * cartItem.qty,
        price: cartItem.price,
        total: totalPrice,
        condition: cartItem.condition
      }
    })

    return {
      type: cart.type,
      store,
      shipping: [],
      listProduct: enrichedProducts,
      totalVat: parseFloat((cart.total - cart.total / 1.07).toFixed(2)),
      totalExVat: parseFloat((cart.total / 1.07).toFixed(2)),
      total: parseFloat(cart.total.toFixed(2)),
      createdAt: cart.created,
      updatedAt: cart.updated
    }
  } catch (error) {
    console.error('Error transforming cart data:', error.message)
    return null
  }
}

async function summaryOrderProStatusOne(cart, listPromotion, channel, res) {
  try {
    if (!cart) {
      throw new Error('Cart data is required')
    }
    const { Store } = getModelsByChannel(channel, res, storeModel);

    const storeData = await Store.findOne({ storeId: cart.storeId }).lean()

    const store = storeData
      ? {
        _id: storeData._id,
        storeId: storeData.storeId,
        name: storeData.name || '',
        taxId: storeData.taxId || '',
        tel: storeData.tel || '',
        route: storeData.route || '',
        storeType: storeData.type || '',
        typeName: storeData.typeName || '',
        address: storeData.address || '',
        subDistrict: storeData.subDistrict || '',
        district: storeData.district || '',
        province: storeData.province || '',
        zone: storeData.zone || '',
        area: storeData.area || ''
      }
      : {}

    const productIds = [
      ...cart.listProduct.map(p => p.id),
      ...(cart.listPromotion
        ? cart.listPromotion.flatMap(promo => promo.listProduct.map(p => p.id))
        : [])
    ]
    const { Product } = getModelsByChannel(channel, res, productModel);

    const productDetails = await Product.find({
      id: { $in: productIds }
    }).lean()


    let enrichedProducts = [] // ประกาศตัวแปรไว้ก่อน
    // if (changePromotionStatus == 0) {
    // console.log('changePromotionStatus = 0', changePromotionStatus);
    enrichedProducts = cart.listProduct.map(cartItem => {
      const productInfo = productDetails.find(p => p.id === cartItem.id) || {}
      const unitData =
        productInfo.listUnit?.find(u => u.unit === cartItem.unit) || {}
      const factor = parseInt(unitData?.factor, 10) || 1
      // console.log("factor",factor);
      const qtyPcs = cartItem.qty * factor
      const totalPrice = cartItem.qty * cartItem.price
      return {
        id: cartItem.id,
        // lot: cartItem.lot,
        name: cartItem.name,
        groupCode: productInfo.groupCode || '',
        group: productInfo.group || '',
        brandCode: productInfo.brandCode || '',
        brand: productInfo.brand || '',
        size: productInfo.size || '',
        flavourCode: productInfo.flavourCode || '',
        flavour: productInfo.flavour || '',
        qty: cartItem.qty,
        unit: cartItem.unit,
        unitName: unitData.name || '',
        price: cartItem.price,
        total: totalPrice,
        qtyPcs
      }
    })




    // let unitDataArray = []
    // listProducts.forEach(innerArray => {
    //   innerArray.forEach(item => {
    //     const productInfo = productDetails.find(p => p.id === item.id) || {}

    //     if (productInfo.listUnit) {
    //       const foundUnit = productInfo.listUnit.find(u => u.unit === item.unit)
    //       if (foundUnit) {
    //         // เก็บ item.id ร่วมกับข้อมูล unit ที่พบ
    //         unitDataArray.push({
    //           itemId: item.id,
    //           unit: foundUnit.unit,
    //           name: foundUnit.name,
    //           factor: foundUnit.factor,
    //           sale: foundUnit.price.sale,
    //           refund: foundUnit.price.refund
    //         })
    //       }
    //     }
    //   })
    // })

    // listPromotion.forEach(promo => {
    //   promo.listProduct.forEach(product => {
    //     const unitData = unitDataArray.find(unit => unit.itemId === product.id)

    //     if (unitData) {
    //       product.unitData = {
    //         unit: unitData.unit,
    //         name: unitData.name,
    //         factor: unitData.factor,
    //         sale: unitData.sale,
    //         refund: unitData.refund
    //       }
    //     }
    //   })
    // })
    // console.log(cart.listPromotion)
    const enrichedPromotions = (cart.listPromotion || []).map(promo => {
      const plainPromo = promo.toObject ? promo.toObject() : promo;

      const enrichedProducts = plainPromo.listProduct.map(promoProduct => {
        const productInfo = productDetails.find(p => p.id === promoProduct.id) || {};
        const unitData = productInfo.listUnit?.find(u => u.unit === promoProduct.unit) || {};
        const factor = parseInt(unitData?.factor, 10) || 1;
        const qtyPcs = promoProduct.qty * factor;

        return {
          ...promoProduct,
          qtyPcs
        };
      });

      return {
        ...plainPromo,
        listProduct: enrichedProducts
      };
    });

    const order = {
      order: {
        store: store.storeId,
      },
      listProduct: enrichedProducts
    }
    const promotion = await applyPromotion(order, channel, res)


    const mergedMap = new Map();

    // listPromotion.forEach(promo => {
    // mergedMap.set(promo.proId, promo)
    // })

    let listPromotionNew = ''

    listPromotionNew = listPromotion.map(listItem => {
      const promo = promotion.appliedPromotions.find(p => p.proId === listItem.proId);

      if (promo && promo.proQty !== listItem.proQty) {
        return promo;
      }

      return listItem;
    });



    enrichedPromotions.forEach(promo => {
      mergedMap.set(promo.proId, promo)
    })

    listPromotionNew.forEach(promo => {
      mergedMap.set(promo.proId, promo)
    })



    const promoProduct = Array.from(mergedMap.values());

    // console.log(listPromotionNew)


    return {
      type: cart.type,
      store,
      shipping: [],
      listProduct: enrichedProducts,
      // listRefund: [],
      listPromotion: promoProduct,
      listQuota: cart.listQuota,
      total: parseFloat(cart.total.toFixed(2)),
      subtotal: 0,
      discount: 0,
      discountProduct: 0,
      vat: 0,
      totalExVat: 0
    }
  } catch (error) {
    console.error('Error transforming cart data:', error.message)
    return null
  }
}

async function summaryWithdraw(cart, channel, res) {
  try {
    if (!cart) {
      throw new Error('Cart data is required')
    }
    const { Product } = getModelsByChannel(channel, res, productModel);

    const productIds = cart.listProduct.map(p => p.id)
    const productDetails = await Product.find({
      id: { $in: productIds }
    }).lean()

    let totalQty = 0
    const enrichedProducts = cart.listProduct.map(cartItem => {
      const productInfo = productDetails.find(p => p.id === cartItem.id) || {}
      const unitData =
        productInfo.listUnit?.find(u => u.unit === cartItem.unit) || {}
      const qtyPcs = unitData?.factor || cartItem.qty
      const totalPrice = cartItem.qty * cartItem.price
      totalQty += cartItem.qty

      return {
        id: cartItem.id,
        name: cartItem.name,
        group: productInfo.group || '',
        brand: productInfo.brand || '',
        size: productInfo.size || '',
        flavour: productInfo.flavour || '',
        qty: cartItem.qty,
        unit: cartItem.unit,
        unitName: unitData.name,
        price: cartItem.price,
        total: totalPrice,
        qtyPcs: qtyPcs * cartItem.qty
      }
    })

    return {
      type: cart.type,
      listProduct: enrichedProducts,
      total: totalQty,
      created: cart.created,
      updated: cart.updated
    }
  } catch (error) {
    console.error('Error transforming cart data:', error.message)
    return null
  }
}

async function summaryRefund(cart, channel, res) {
  try {
    if (!cart) {
      throw new Error('Cart data is required')
    }
    const { Store } = getModelsByChannel(channel, res, storeModel);
    const storeData = await Store.findOne({ storeId: cart.storeId }).lean()
    // console.log(storeData)
    const store = storeData
      ? {
        storeId: storeData.storeId,
        name: storeData.name || '',
        taxId: storeData.taxId || '',
        tel: storeData.tel || '',
        route: storeData.route || '',
        storeType: storeData.type || '',
        typeName: storeData.typeName || '',
        address: storeData.address || '',
        subDistrict: storeData.subDistrict || '',
        district: storeData.district || '',
        province: storeData.province || '',
        zone: storeData.zone || '',
        area: storeData.area || ''
      }
      : {}

    const productIds = [
      ...cart.listProduct.map(p => p.id),
      ...cart.listRefund.map(p => p.id)
    ]
    const { Product } = getModelsByChannel(channel, res, productModel);

    const productDetails = await Product.find({
      id: { $in: productIds }
    }).lean()

    let totalRefund = 0
    let totalProduct = 0

    const enrichedProducts = cart.listProduct.map(cartItem => {
      const productInfo = productDetails.find(p => p.id === cartItem.id) || {}
      const unitData =
        productInfo.listUnit?.find(u => u.unit === cartItem.unit) || {}
      const qtyPcs = unitData?.factor || cartItem.qty
      const totalPrice = cartItem.qty * cartItem.price
      totalProduct += totalPrice



      return {
        id: cartItem.id,
        name: cartItem.name,
        group: productInfo.group || '',
        brand: productInfo.brand || '',
        size: productInfo.size || '',
        flavour: productInfo.flavour || '',
        qty: cartItem.qty.toFixed(),
        unit: cartItem.unit,
        unitName: unitData.name,
        qtyPcs: (qtyPcs * cartItem.qty).toFixed(),
        price: cartItem.price.toFixed(2),
        subtotal: totalPrice.toFixed(2),
        netTotal: totalPrice.toFixed(2)
      }
    })
    // console.log("cart",cart)
    const enrichedRefunds = cart.listRefund.map(refundItem => {
      const productInfo = productDetails.find(p => p.id === refundItem.id) || {}
      const unitData =
        productInfo.listUnit?.find(u => u.unit === refundItem.unit) || {}
      const qtyPcs = unitData?.factor || refundItem.qty
      const totalRefundPrice = refundItem.qty * refundItem.price
      totalRefund += totalRefundPrice

      return {
        id: refundItem.id,
        lot: refundItem.lot,
        name: refundItem.name,
        group: productInfo.group || '',
        brand: productInfo.brand || '',
        size: productInfo.size || '',
        flavour: productInfo.flavour || '',
        qty: refundItem.qty.toFixed(),
        unit: refundItem.unit,
        unitName: unitData.name,
        qtyPcs: (qtyPcs * refundItem.qty).toFixed(),
        price: refundItem.price.toFixed(2),
        total: totalRefundPrice.toFixed(2),
        condition: refundItem.condition,
        expireDate: refundItem.expireDate
      }
    })

    return {
      type: cart.type,
      store,
      listProduct: enrichedProducts,
      listRefund: enrichedRefunds,
      totalRefund: totalRefund.toFixed(2),
      totalChange: totalProduct.toFixed(2),
      totalExVat: ((totalProduct - totalRefund) / 1.07).toFixed(2),
      totalVat: (
        totalProduct -
        totalRefund -
        (totalProduct - totalRefund) / 1.07
      ).toFixed(2),
      totalNet: (totalProduct - totalRefund).toFixed(2),
      created: cart.created,
      updated: cart.updated
    }
  } catch (error) {
    console.error('Error transforming refund cart data:', error.message)
    return null
  }
}

// async function summaryGive (cart,channel,res) {
//   try {
//     if (!cart) {
//       throw new Error('Cart data is required')
//     }
//     const { Store } = getModelsByChannel(channel,res,storeModel); 
//     const storeData = await Store.findOne({ storeId: cart.storeId }).lean()
//     const store = storeData
//       ? {
//           storeId: storeData.storeId,
//           name: storeData.name || '',
//           taxId: storeData.taxId || '',
//           tel: storeData.tel || '',
//           route: storeData.route || '',
//           storeType: storeData.type || '',
//           typeName: storeData.typeName || '',
//           address: storeData.address || '',
//           subDistrict: storeData.subDistrict || '',
//           district: storeData.district || '',
//           province: storeData.province || '',
//           zone: storeData.zone || '',
//           area: storeData.area || ''
//         }
//       : {}

//     const productIds = cart.listProduct.map(p => p.id)
//     const { Product } = getModelsByChannel(channel,res,productModel); 

//     const productDetails = await Product.find({
//       id: { $in: productIds }
//     }).lean()

//     const enrichedProducts = cart.listProduct.map(cartItem => {
//       const productInfo = productDetails.find(p => p.id === cartItem.id) || {}
//       const unitData =
//         productInfo.listUnit?.find(u => u.unit === cartItem.unit) || {}
//       const qtyPcs = unitData?.factor || cartItem.qty
//       const totalPrice = cartItem.qty * cartItem.price

//       return {
//         id: cartItem.id,
//         name: cartItem.name,
//         group: productInfo.group || '',
//         brand: productInfo.brand || '',
//         size: productInfo.size || '',
//         flavour: productInfo.flavour || '',
//         qty: cartItem.qty,
//         unit: cartItem.unit,
//         unitName: unitData.name,
//         qtyPcs: qtyPcs * cartItem.qty,
//         price: cartItem.price,
//         total: totalPrice
//       }
//     })

//     return {
//       type: cart.type,
//       store,
//       shipping: [],
//       listProduct: enrichedProducts,
//       totalVat: parseFloat((cart.total - cart.total / 1.07).toFixed(2)),
//       totalExVat: parseFloat((cart.total / 1.07).toFixed(2)),
//       total: parseFloat(cart.total.toFixed(2)),
//       createdAt: cart.created,
//       updatedAt: cart.updated
//     }
//   } catch (error) {
//     console.error('Error transforming cart data:', error.message)
//     return null
//   }
// }

module.exports = {
  summaryOrder,
  summaryOrderProStatusOne,
  summaryWithdraw,
  summaryRefund,
  summaryGive
}
