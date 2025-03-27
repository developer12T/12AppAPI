const mongoose = require('mongoose')
const { dbCA } = require('../../config/db')

const promotionSchema = new mongoose.Schema({
    proId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String },
    proType: {
        type: String,
        required: true,
        enum: ['amount', 'free', 'discount']
    },

    proCode: { type: String },
    coupon: { type: String },

    applicableTo: {
        store: [{ type: String }],
        typeStore: [{ type: String }],
        zone: [{ type: String }],
        area: [{ type: String }],
    },

    except: [{ type: String }],

    conditions: [
        {
            productId: [{ type: String }],
            productGroup: [{ type: String }],
            productFlavour: [{ type: String }],
            productBrand: [{ type: String }],
            productSize: [{ type: String }],
            productUnit: [{ type: String }],
            productQty: { type: Number, default: 0 },
            productAmount: { type: Number, default: 0 }
        }
    ],

    rewards: [
        {
            productId: { type: String },
            productGroup: { type: String },
            productFlavour: { type: String },
            productBrand: { type: String },
            productSize: { type: String },
            productUnit: { type: String },
            productQty: { type: Number, required: true },
            limitType: { type: String, enum: ['limited', 'unlimited'], default: 'limited' }
        }
    ],

    discounts: [
        {
            minOrderAmount: { type: Number, default: 0 },
            discountType: { type: String, enum: ['percent', 'amount'] },
            discountValue: { type: Number, required: true },
            limitType: { type: String, enum: ['limited', 'unlimited'], default: 'limited' }
        }
    ],

    validFrom: { type: Date, required: true },
    validTo: { type: Date, required: true },

    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
})

const Promotion = dbCA.model('Promotion', promotionSchema)
module.exports = { Promotion }