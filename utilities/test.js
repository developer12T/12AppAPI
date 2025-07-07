async function summaryOrder (cart,channel,res) {
  try {
    if (!cart) {
      throw new Error('Cart data is required')
    }

    const { Store } = getModelsByChannel(channel,res,storeModel); 
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

    const { Product } = getModelsByChannel(channel,res,productModel); 

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
        lot: cartItem.lot,
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

    // console.log('enrichedPromotions',enrichedPromotions)

    return {
      type: cart.type,
      store,
      shipping: [],
      listProduct: enrichedProducts,
      // listRefund: [],
      listPromotion: enrichedPromotions,
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