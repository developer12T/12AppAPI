const { Product } = require('../models/cash/product')
const { Store } = require('../models/cash/store')
const { User } = require('../models/cash/user')

async function summaryOrder(cart) {
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
      // console.log("factor",factor);
      const qtyPcs = cartItem.qty * factor;
      const totalPrice = cartItem.qty * cartItem.price;

      return {
        id: cartItem.id,
        lot: cartItem.lot,
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

async function summaryWithdraw(cart) {
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

async function summaryRefund(cart) {
  try {
    if (!cart) {
      throw new Error('Cart data is required')
    }
    console.log("summaryRefund", cart.storeId)
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

async function summaryGive(cart) {
  try {
    if (!cart) {
      throw new Error('Cart data is required')
    }
    console.log("summaryGive", cart.storeId)
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


async function summaryOrderProStatusOne(cart, listPromotion) {
  try {
    if (!cart) {
      throw new Error('Cart data is required')
    }

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

    const productDetails = await Product.find({
      id: { $in: productIds }
    }).lean();

    let listProducts = [];
    enrichedProducts = listPromotion
    listPromotion.forEach(promotion => {
      // เก็บข้อมูลใน listProduct ของแต่ละโปรโมชั่นลงในตัวแปร listProducts
      listProducts.push(promotion.listProduct);
    });
    // วนลูปผ่านแต่ละอาร์เรย์ใน listProducts
    let unitDataArray = [];

    listProducts.forEach(innerArray => {
      innerArray.forEach(item => {
        const productInfo = productDetails.find(p => p.id === item.id) || {};
        
        if (productInfo.listUnit) {
          const foundUnit = productInfo.listUnit.find(u => u.unit === item.unit);
          if (foundUnit) {
            // เก็บ item.id ร่วมกับข้อมูล unit ที่พบ
            unitDataArray.push({
              itemId: item.id,
              unit: foundUnit.unit,
              name: foundUnit.name,
              factor: foundUnit.factor,
              sale: foundUnit.price.sale,
              refund: foundUnit.price.refund
            });
          }
        }
      });
    });
    
    // แสดงข้อมูล unitDataArray
    // console.log("unitDataArray", JSON.stringify(unitDataArray, null, 2));

    listPromotion.forEach(promo => {
      promo.listProduct.forEach(product => {
        // หาค่าจาก unitDataArray ที่ตรงกับ itemId
        const unitData = unitDataArray.find(unit => unit.itemId === product.id);
        
        // ถ้ามีข้อมูล unitData ให้เพิ่มเข้าไปใน product
        if (unitData) {
          // เพิ่ม unitData เข้าไปใน product
          product.unitData = {
            unit: unitData.unit,
            name: unitData.name,
            factor: unitData.factor,
            sale: unitData.sale,
            refund: unitData.refund
          };
        }
      });
    });
    // แสดงผลข้อมูล listPromotion ที่มีข้อมูล unitData
    // console.log("listPromotion with unitData", JSON.stringify(listPromotion, null, 2));




    const enrichedPromotionExtract = listPromotion.map(promo => ({
      proCode: promo?.proCode || '',
      proName: promo.proName,
      proType: promo.proType,
      proQty: promo.proQty || 0,
      discount: promo.discount || 0,
      listProduct: promo.listProduct.map(product => ({
        id: product.id,
        name: product.name,
        group: product.group,
        size:product.size,
        flavour: product.flavour,
        brand: product.brand,
        qty: product.qty,
        unit: product.unit,
        unitName: product.unitName,
        price: 0,
        total: 0,
        qtyPcs: product.qty * (product.unitData?.factor || 0)  // ใช้ product.unitData.factor
      }))
    }));
   


    return {
      type: cart.type,
      store,
      shipping: [],
      listProduct: enrichedProducts,
      // listRefund: [],
      listPromotion: enrichedPromotionExtract,
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

async function summaryWithdraw(cart) {
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

async function summaryRefund(cart) {
  try {
    if (!cart) {
      throw new Error('Cart data is required')
    }
    // console.log("summaryRefund",cart.storeId)
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

async function summaryGive(cart) {
  try {
    if (!cart) {
      throw new Error('Cart data is required')
    }
    // console.log("summaryGive",cart.storeId)
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
