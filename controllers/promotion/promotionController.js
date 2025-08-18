const { generatePromotionId } = require('../../utilities/genetateId')
const { getRewardProduct } = require('./calculate')
// const { Promotion } = require('../../models/cash/promotion')
// const { Cart } = require('../../models/cash/cart')
// const { Product } = require('../../models/cash/product')
const promotionModel = require('../../models/cash/promotion')
const CartModel = require('../../models/cash/cart')
const productModel = require('../../models/cash/product')
const { getSocket } = require('../../socket')
const { getModelsByChannel } = require('../../middleware/channel')

exports.addPromotion = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { Promotion } = getModelsByChannel(channel, res, promotionModel)
    const {
      name,
      description,
      proType,
      proCode,
      coupon,
      applicableTo,
      except,
      conditions,
      rewards,
      discounts,
      validFrom,
      validTo
    } = req.body

    if (!name || !proType || !validFrom || !validTo) {
      return res
        .status(400)
        .json({ status: 400, message: 'Missing required fields!' })
    }

    const proId = await generatePromotionId(channel, res)

    const newPromotion = new Promotion({
      proId,
      name,
      description,
      proType,
      proCode,
      coupon,
      applicableTo,
      except,
      conditions,
      rewards,
      discounts,
      validFrom,
      validTo,
      status: 'active'
    })

    await newPromotion.save()

    const io = getSocket()
    io.emit('promotion/add', {
      status: 201,
      message: 'Promotion created successfully!',
      data: newPromotion
    })

    res.status(201).json({
      status: 201,
      message: 'Promotion created successfully!',
      data: newPromotion
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.addPromotionM3 = async (req, res) => {
  try {
    const { period } = req.query
    const channel = req.headers['x-channel']
    const { Promotion } = getModelsByChannel(channel, res, promotionModel)
    const { User } = getModelsByChannel(channel, res, userModel)
    const { Store } = getModelsByChannel(channel, res, storeModel)

    const users = await User.find({ role: 'sale' })
      .select('area saleCode warehouse')
      .lean()

    for (const user of users) {
      const range = rangeDate(period) // ฟังก์ชันที่คุณมีอยู่แล้ว
      const startDate = range.startDate
      const endDate = range.endDate
      const stores = await Store.find({
        area: user.area,
        createdAt: { $gte: startDate, $lte: endDate }
      }).select('')
      for (const store of stores) {
        const promotions = await Promotion.find({
          proId: { $regex: `PRO-${period}`, $options: 'i' }
        })

        for (const promotion of promotions) {
          
        }
      }
    }
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.updatePromotion = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { Promotion } = getModelsByChannel(channel, res, promotionModel)
    const {
      proId,
      name,
      description,
      proType,
      proCode,
      coupon,
      applicableTo,
      except,
      conditions,
      rewards,
      discounts,
      validFrom,
      validTo
    } = req.body

    if (!proId) {
      return res.status(400).json({ status: 400, message: 'Missing proId!' })
    }

    const updateFields = {}
    if (name !== undefined) updateFields.name = name
    if (description !== undefined) updateFields.description = description
    if (proType !== undefined) updateFields.proType = proType
    if (proCode !== undefined) updateFields.proCode = proCode
    if (coupon !== undefined) updateFields.coupon = coupon
    if (applicableTo !== undefined) updateFields.applicableTo = applicableTo
    if (except !== undefined) updateFields.except = except
    if (conditions !== undefined) updateFields.conditions = conditions
    if (rewards !== undefined) updateFields.rewards = rewards
    if (discounts !== undefined) updateFields.discounts = discounts
    if (validFrom !== undefined) updateFields.validFrom = validFrom
    if (validTo !== undefined) updateFields.validTo = validTo
    // updateFields.status = 'active';

    const updatedPromotion = await Promotion.findOneAndUpdate(
      { proId },
      { $set: updateFields },
      { upsert: true, new: true }
    )

    const io = getSocket()
    io.emit('promotion/updatePromotion', {
      status: 201,
      message: 'Promotion updated successfully!',
      data: updatedPromotion
    })

    res.status(201).json({
      status: 201,
      message: 'Promotion updated successfully!',
      data: updatedPromotion
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: '500', message: error.message })
  }
}

exports.getPromotionProduct = async (req, res) => {
  try {
    const { type, storeId, proId } = req.body

    const channel = req.headers['x-channel'] // 'credit' or 'cash'
    const { Cart } = getModelsByChannel(channel, res, CartModel)

    if (!type || !storeId || !proId) {
      return res.status(400).json({
        status: 400,
        message: 'type, storeId, and proId are required!'
      })
    }

    const cart = await Cart.findOne({ type, storeId }).lean()
    // console.log(cart)
    if (!cart || !cart.listPromotion.length) {
      return res.status(404).json({
        status: 404,
        message: 'No applicable promotions found in the cart!'
      })
    }

    const promotion = cart.listPromotion.find(promo => promo.proId === proId)

    if (!promotion) {
      return res
        .status(404)
        .json({ status: 404, message: 'Promotion not found in the cart!' })
    }

    const rewardProducts = await getRewardProduct(proId, channel, res)

    if (!rewardProducts.length) {
      return res
        .status(404)
        .json({ status: 404, message: 'No reward products found!' })
    }

    // console.log(rewardProducts)

    const groupedProducts = {}

    rewardProducts.forEach(product => {
      const key = `${product.group}|${product.size}`

      if (!groupedProducts[key]) {
        groupedProducts[key] = {
          group: product.group,
          size: product.size,
          product: []
        }
      }

      groupedProducts[key].product.push({
        id: product.id,
        group: product.group,
        flavour: product.flavour,
        brand: product.brand,
        size: product.size,
        unit: product.unit,
        qty: 1,
        name: product.name
      })
    })

    const response = {
      proId: promotion.proId,
      name: promotion.proName,
      qty: promotion.proQty,
      listProduct: Object.values(groupedProducts)
    }

    // const io = getSocket()
    // io.emit('promotion/getPromotionProduct', {});

    res.status(200).json({
      status: 200,
      message: 'successfully!',
      data: response
    })
  } catch (error) {
    console.error('Error fetching eligible promotion products:', error)
    res.status(500).json({ status: 500, message: 'Server error' })
  }
}

exports.updateCartPromotion = async (req, res) => {
  try {
    const { type, area, storeId, proId, productId, qty } = req.body

    if (
      !type ||
      !area ||
      !storeId ||
      !proId ||
      !productId ||
      qty === undefined
    ) {
      return res
        .status(400)
        .json({ status: 400, message: 'Missing required fields!' })
    }
    const channel = req.headers['x-channel'] // 'credit' or 'cash'
    const { Cart } = getModelsByChannel(channel, res, CartModel)

    let cart = await Cart.findOne({ type, area, storeId })
    if (!cart) {
      return res.status(404).json({ status: 404, message: 'Cart not found!' })
    }

    let promotion = cart.listPromotion.find(promo => promo.proId === proId)
    if (!promotion) {
      return res
        .status(404)
        .json({ status: 404, message: 'Promotion not found!' })
    }

    const { Product } = getModelsByChannel(channel, res, productModel)

    const product = await Product.findOne({ id: productId }).lean()
    if (!product) {
      return res
        .status(404)
        .json({ status: 404, message: 'Product not found!' })
    }

    let promoProduct = promotion.listProduct.find(p => p.id === productId)
    if (!promoProduct) {
      return res
        .status(404)
        .json({ status: 404, message: 'Product is not in promotion list!' })
    }

    const matchingUnit = product.listUnit.find(
      unit => unit.unit === promoProduct.unit
    )
    if (!matchingUnit) {
      return res.status(400).json({
        status: 400,
        message: `Unit '${promoProduct.unit}' not found for this product!`
      })
    }

    if (qty > promotion.proQty) {
      return res.status(400).json({
        status: 400,
        message: `Cannot update quantity more than allowed promotion limit (${promotion.proQty})`
      })
    }

    promoProduct.qty = qty
    promoProduct.unit = matchingUnit.unit
    promoProduct.unitName = matchingUnit.name

    await cart.save()

    res.status(200).json({
      status: 200,
      message: 'Promotion updated successfully!',
      data: cart.listPromotion
    })
  } catch (error) {
    console.error('Error updating promotion in cart:', error)
    res.status(500).json({ status: 500, message: error.message })
  }
}

exports.getPromotionDetail = async (req, res) => {
  const { proId } = req.query
  const channel = req.headers['x-channel']
  const { Promotion } = getModelsByChannel(channel, res, promotionModel)

  const data = await Promotion.findOne({ proId: proId })

  if (data.length == 0) {
    return res.status(404).json({
      status: 200,
      message: 'Not Found Promotion'
    })
  }

  // const io = getSocket()
  // io.emit('promotion/getPromotionDetail', {});

  res.status(200).json({
    status: 200,
    message: 'sucess',
    data: data
  })
}

exports.getPromotion = async (req, res) => {
  const channel = req.headers['x-channel'] // 'credit' or 'cash'
  const { Promotion } = getModelsByChannel(channel, res, promotionModel)

  const data = await Promotion.find({ status: 'active' }).sort({ proId: 1 })

  if (data.length == 0) {
    return res.status(404).json({
      status: 200,
      message: 'Not Found Promotion'
    })
  }

  res.status(200).json({
    status: 200,
    message: 'sucess',
    data: data
  })
}

exports.addPromotionLimit = async (req, res) => {
  const channel = req.headers['x-channel']
  const { PromotionLimit } = getModelsByChannel(channel, res, promotionModel)
  const {
    name,
    description,
    proType,
    proCode,
    coupon,
    startDate,
    endDate,
    giftItem,
    limitTotal,
    condition,
    tracking,
    status
  } = req.body

  if (!name || !proType) {
    return res
      .status(400)
      .json({ status: 400, message: 'Missing required fields!' })
  }

  const proId = await generatePromotionId(channel, res)

  const newPromotionLimit = new PromotionLimit({
    proId,
    name,
    description,
    proType,
    proCode,
    coupon,
    startDate,
    endDate,
    giftItem,
    limitTotal,
    condition,
    tracking,
    status
  })

  await newPromotionLimit.save()

  const io = getSocket()
  io.emit('promotion/addPromotionLimit', {})

  res.status(201).json({
    status: 201,
    message: 'Promotion created successfully!',
    data: newPromotionLimit
  })
}

exports.updatePromotionLimit = async (req, res) => {
  const channel = req.headers['x-channel']
  const { PromotionLimit } = getModelsByChannel(channel, res, promotionModel)
  const {
    proId,
    name,
    description,
    proType,
    proCode,
    coupon,
    startDate,
    endDate,
    giftItem,
    limitTotal,
    condition,
    tracking,
    status
  } = req.body

  const existing = await PromotionLimit.findOne({ proId })

  if (!existing) {
    return res.status(404).json({ status: 404, message: 'Promotion not found' })
  }

  await PromotionLimit.updateOne(
    { proId },
    {
      $set: {
        name,
        description,
        proType,
        proCode,
        coupon,
        startDate,
        endDate,
        giftItem,
        limitTotal,
        condition,
        tracking,
        status
      }
    }
  )

  const io = getSocket()
  io.emit('promotion/updatePromotionLimit', {})

  return res.status(200).json({ status: 200, message: 'Updated successfully' })
}

exports.addQuota = async (req, res) => {
  const {
    quotaId,
    detail,
    proCode,
    quota,
    applicableTo,
    conditions,
    rewards,
    discounts,
    validFrom,
    validTo
  } = req.body

  const channel = req.headers['x-channel']
  const { Quota } = getModelsByChannel(channel, res, promotionModel)

  const exitQuota = await Quota.findOne({ quotaId: quotaId })
  if (exitQuota) {
    return res.status(400).json({
      status: 400,
      message: 'This quotaId already in database'
    })
  }

  const data = await Quota.create({
    quotaId: quotaId,
    detail: detail,
    proCode: proCode,
    quota: quota,
    applicableTo: applicableTo,
    conditions: conditions,
    rewards: rewards,
    discounts: discounts,
    validFrom: validFrom,
    validTo: validTo
  })

  const io = getSocket()
  io.emit('promotion/addQuota', {})

  res.status(200).json({
    status: 200,
    message: 'sucess',
    data: data
  })
}

exports.updateQuota = async (req, res) => {
  const {
    quotaId,
    detail,
    proCode,
    id,
    quotaGroup,
    quotaWeight,
    quota,
    quotaUse,
    rewards,
    area,
    zone,
    ExpDate
  } = req.body

  const channel = req.headers['x-channel']
  const { Quota } = getModelsByChannel(channel, res, promotionModel)

  const exitQuota = await Quota.findOne({ quotaId: quotaId })
  if (!exitQuota) {
    return res.status(404).json({
      status: 404,
      message: 'This quotaId not found'
    })
  }

  const data = await Quota.updateOne(
    { quotaId: quotaId },
    {
      $set: {
        detail: detail,
        proCode: proCode,
        id: id,
        quotaGroup: quotaGroup,
        quotaWeight: quotaWeight,
        quota: quota,
        quotaUse: quotaUse,
        rewards: rewards,
        area: area,
        zone: zone,
        ExpDate: ExpDate
      }
    }
  )

  const io = getSocket()
  io.emit('promotion/updateQuota', {})

  res.status(200).json({
    status: 200,
    message: 'sucess'
  })
}

exports.addPromotionShelf = async (req, res) => {
  const { proShelfId, period, storeId, price } = req.body

  const channel = req.headers['x-channel']
  const { PromotionShelf } = getModelsByChannel(channel, res, promotionModel)

  const dataExist = await PromotionShelf.findOne({
    proShelfId: proShelfId,
    storeId: storeId,
    period: period
  })
  if (dataExist) {
    return res.status(400).json({
      status: 400,
      message: 'already in database'
    })
  }
  const data = await PromotionShelf.create({
    proShelfId: proShelfId,
    storeId: storeId,
    period: period,
    price: price
  })

  const io = getSocket()
  io.emit('promotion/addPromotionShelf', {})

  res.status(200).json({
    status: 200,
    message: 'addPromotionShelf',
    data: data
  })
}

exports.deletePromotion = async (req, res) => {
  try {
    const { proId } = req.body
    const channel = req.headers['x-channel']
    const { Promotion } = getModelsByChannel(channel, res, promotionModel)

    const promotion = await Promotion.findOne({ proId })

    if (!promotion) {
      return res.status(404).json({
        status: 404,
        message: 'Promotion not found'
      })
    }

    // เปลี่ยนสถานะเป็น inactive แทนการลบ
    await Promotion.updateOne({ proId }, { status: 'inactive' })

    return res.status(200).json({
      status: 200,
      message: 'Promotion marked as inactive successfully'
    })
  } catch (error) {
    console.error('deletePromotion error:', error)
    return res.status(500).json({
      status: 500,
      message: 'Internal server error'
    })
  }
}
