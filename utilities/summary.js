const { Product } = require('../models/cash/product')
const { Store } = require('../models/cash/store')
const { User } = require('../models/cash/user')

async function summaryOrder (cart) {
  try {
    if (!cart) {
      throw new Error('Cart data is required')
    }
    // console.log("summaryOrder",cart.storeId)
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
    // ตัวอย่างการทำงานของโค้ด
    // const cart = {
    //   listProduct: [{ id: 101 }, { id: 102 }],
    //   listPromotion: [
    //     { listProduct: [{ id: 201 }, { id: 202 }] },
    //     { listProduct: [{ id: 203 }] }
    //   ]
    // };

    const productDetails = await Product.find({
      id: { $in: productIds }
    }).lean()
    // หา Product ที่อยู่ใน อาร์เรย์ productIds แล้วเอาแต่ id


    
    let enrichedProducts = []; // ประกาศตัวแปรไว้ก่อน
    // if (changePromotionStatus == 0) { 
      // console.log('changePromotionStatus = 0', changePromotionStatus);
      enrichedProducts = cart.listProduct.map(cartItem => {
        const productInfo = productDetails.find(p => p.id === cartItem.id) || {};
        const unitData = productInfo.listUnit?.find(u => u.unit === cartItem.unit) || {};
        const factor = parseInt(unitData?.factor, 10) || 1;
        const qtyPcs = cartItem.qty * factor;
        const totalPrice = cartItem.qty * cartItem.price;
    
        return {
          id: cartItem.id,
          test: cartItem.id,
          name: cartItem.name,
          group: productInfo.group || '',
          brand: productInfo.brand || '',
          size: productInfo.size || '',
          flavour: productInfo.flavour || '',
          qty: cartItem.qty,
          unit: cartItem.unit,
          unitName: unitData.name || '',
          price: cartItem.price,
          total: totalPrice,
          qtyPcs
        };
      });
    
  
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

  // console.log('enrichedPromotions',enrichedPromotions)



    return {
      type: cart.type,
      store,
      shipping: [],
      listProduct: enrichedProducts,
      // listRefund: [],
      listPromotion: enrichedPromotions,
      total: parseFloat(cart.total.toFixed(2)),
      subtotal: 0,
      discount: 0,
      discountProduct: 0,
      vat: 0,
      totalExVat: 0
    }
    // }
    


      // ✅ Log ค่าแต่ละตัวหลังจาก enrichedProducts ถูกสร้าง

    






  // console.log(enrichedProducts) // สามารถใช้งาน enrichedProducts ได้
  

  // console.log('enrichedPromotions',enrichedProducts)




  
  } catch (error) {
    console.error('Error transforming cart data:', error.message)
    return null
  }
}

async function summaryWithdraw (cart) {
  try {
    if (!cart) {
      throw new Error('Cart data is required')
    }

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

async function summaryRefund (cart) {
  try {
    if (!cart) {
      throw new Error('Cart data is required')
    }
    console.log("summaryRefund",cart.storeId)
    const storeData = await Store.findOne({ storeId: cart.storeId }).lean()
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

    const enrichedRefunds = cart.listRefund.map(refundItem => {
      const productInfo = productDetails.find(p => p.id === refundItem.id) || {}
      const unitData =
        productInfo.listUnit?.find(u => u.unit === refundItem.unit) || {}
      const qtyPcs = unitData?.factor || refundItem.qty
      const totalRefundPrice = refundItem.qty * refundItem.price
      totalRefund += totalRefundPrice

      return {
        id: refundItem.id,
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

async function summaryGive (cart) {
  try {
    if (!cart) {
      throw new Error('Cart data is required')
    }
    console.log("summaryGive",cart.storeId)
    const storeData = await Store.findOne({ storeId: cart.storeId }).lean()
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
    const productDetails = await Product.find({
      id: { $in: productIds }
    }).lean()

    const enrichedProducts = cart.listProduct.map(cartItem => {
      const productInfo = productDetails.find(p => p.id === cartItem.id) || {}
      const unitData =
        productInfo.listUnit?.find(u => u.unit === cartItem.unit) || {}
      const qtyPcs = unitData?.factor || cartItem.qty
      const totalPrice = cartItem.qty * cartItem.price

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
        qtyPcs: qtyPcs * cartItem.qty,
        price: cartItem.price,
        total: totalPrice
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


async function summaryOrderProStatusOne (cart,listPromotion) {
  try {
    if (!cart) {
      throw new Error('Cart data is required')
    }
    console.log("summaryOrder",cart.storeId)
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
    

    // ตัวอย่างการทำงานของโค้ด
    // const cart = {
    //   listProduct: [{ id: 101 }, { id: 102 }],
    //   listPromotion: [
    //     { listProduct: [{ id: 201 }, { id: 202 }] },
    //     { listProduct: [{ id: 203 }] }
    //   ]
    // };

    const productDetails = await Product.find({
      id: { $in: productIds }
    }).lean()
    // หา Product ที่อยู่ใน อาร์เรย์ productIds แล้วเอาแต่ id

      // console.log('changePromotionStatus = 1', changePromotionStatus);
      // console.log('listPromotion', listPromotion);

      enrichedProducts = listPromotion



      const productInfo = productDetails.find(p => p.id === listPromotion.id) || {};
      const unitData = productInfo.listUnit?.find(u => u.unit === listPromotion.unit) || {};
      const factor = parseInt(unitData?.factor, 10) || 1;
      const enrichedProductsExtract = listPromotion.map(promo => ({
        proName:promo.proName,
        proType:promo.proType,
        proQty: promo.proQty || 0,
        discount:promo.discount ||0,
        listProduct: promo.listProduct.map(product => ({
          id: product.id,
          name: product.name,
          group: product.group,
          flavour : product.flavour,
          brand : product.brand,
          qty: product.qty,
          unit:product.unit,
          unitName:product.unitName,
          price: 0,
          total: 0,
          qtyPcs: promo.qty * factor || 0
        }))
      }));
          // id: promo.id,
          // test: promo.id,
          // name: promo.name,
          // group: promo.group || '',
          // brand: promo.brand || '',
          // size: promo.size || '',
          // flavour: promo.flavour || '',
          // qty: promo.qty,
          // unit: promo.unit,
          // unitName: promo.name || '',
          // price: 0,
          // total: 0,
          // qtyPcs: promo.qty * factor
      
      // }))

      // console.log(JSON.stringify(enrichedProductsExtract, null, 2));


      // const enrichedProducts = {
      //   id: enrichedProductsExtract.id,
      //   test: enrichedProductsExtract.id,
      //   name: enrichedProductsExtract.name,
      //   group: enrichedProductsExtract.group || '',
      //   brand: enrichedProductsExtract.brand || '',
      //   size: enrichedProductsExtract.size || '',
      //   flavour: enrichedProductsExtract.flavour || '',
      //   qty: enrichedProductsExtract.qty,
      //   unit: enrichedProductsExtract.unit,
      //   unitName: enrichedProductsExtract.name || '',
      //   price: enrichedProductsExtract.price,
      //   total: enrichedProductsExtract.total,
      //   qtyPcs: enrichedProductsExtract.qtyPcs
      // };
      // return enrichedProducts

      // const enrichedPromotions =
      // cart.listPromotion?.map(promo => ({
      //   ...promo,
      //   listProduct: promo.listProduct.map(promoProduct => {
      //     const productInfo =
      //       productDetails.find(p => p.id === promoProduct.id) || {}
      //     const unitData =
      //       productInfo.listUnit?.find(u => u.unit === promoProduct.unit) || {}
      //     const factor = parseInt(unitData?.factor, 10) || 1
      //     const qtyPcs = promoProduct.qty * factor

      //     return {
      //       ...promoProduct,
      //       // test: promo.id,
      //       // test: 'dawdaw',
      //       qtyPcs
      //     }
      //   })
      // })) || []




      // const listPromotions = [
      //   {
      //     proName: "",
      //     proType: "",
      //     proQty: 0,
      //     discount: 0,
      //     listProduct: []
      //   },
        // อาจจะมีโปรโมชั่นอื่นๆ ที่ตามมา
      // ];

      
      // const updatedPromotions = enrichedProductsExtract.flatMap(product => 
      //   listPromotions.map(promo => ({
      //     ...promo,
      //     listProduct: [product]  // ทำให้แต่ละโปรโมชั่นมี listProduct เป็นแค่สินค้าหนึ่งตัว
      //   }))
      // );
      
      // console.log(updatedPromotions);

  



    return {
      type: cart.type,
      store,
      shipping: [],
      listProduct: enrichedProducts,
      // listRefund: [],
      listPromotion: enrichedProductsExtract,
      total: parseFloat(cart.total.toFixed(2)),
      subtotal: 0,
      discount: 0,
      discountProduct: 0,
      vat: 0,
      totalExVat: 0
    }
    }
  
   catch (error) {
    console.error('Error transforming cart data:', error.message)
    return null
  }
}

async function summaryWithdraw (cart) {
  try {
    if (!cart) {
      throw new Error('Cart data is required')
    }

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

async function summaryRefund (cart) {
  try {
    if (!cart) {
      throw new Error('Cart data is required')
    }
    console.log("summaryRefund",cart.storeId)
    const storeData = await Store.findOne({ storeId: cart.storeId }).lean()
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

    const enrichedRefunds = cart.listRefund.map(refundItem => {
      const productInfo = productDetails.find(p => p.id === refundItem.id) || {}
      const unitData =
        productInfo.listUnit?.find(u => u.unit === refundItem.unit) || {}
      const qtyPcs = unitData?.factor || refundItem.qty
      const totalRefundPrice = refundItem.qty * refundItem.price
      totalRefund += totalRefundPrice

      return {
        id: refundItem.id,
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

async function summaryGive (cart) {
  try {
    if (!cart) {
      throw new Error('Cart data is required')
    }
    console.log("summaryGive",cart.storeId)
    const storeData = await Store.findOne({ storeId: cart.storeId }).lean()
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
    const productDetails = await Product.find({
      id: { $in: productIds }
    }).lean()

    const enrichedProducts = cart.listProduct.map(cartItem => {
      const productInfo = productDetails.find(p => p.id === cartItem.id) || {}
      const unitData =
        productInfo.listUnit?.find(u => u.unit === cartItem.unit) || {}
      const qtyPcs = unitData?.factor || cartItem.qty
      const totalPrice = cartItem.qty * cartItem.price

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
        qtyPcs: qtyPcs * cartItem.qty,
        price: cartItem.price,
        total: totalPrice
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






















module.exports = { summaryOrder, summaryOrderProStatusOne, summaryWithdraw, summaryRefund, summaryGive }
