const mongoose = require('mongoose')
const { dbCA } = require('../../config/db');
const { ARRAY } = require('sequelize');

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



const promotionLimitSchema = new mongoose.Schema({
    proId: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String },
    proType: {
        type: String,
        required: true,
        enum: ['amount', 'free', 'discount']
    },
    proCode: { type: String },
    coupon: { type: String },
    startDate: { type: String },
    endDate: { type: String },
    giftItem: {
        productId: { type: String, required: true },
        name: { type: String, required: true },
        qtyPerStore: { type: Number }
    },
    limitTotal: { type: Number },
    condition: {
        minOrderAmount: { type: Number },
        applicableStores: [{ type: String }],
        applicableProducts: [{ type: String }],
    },
    tracking: {
        totalUsed: { type: Number },
        storeUsed: [
            {
                storeId: { type: String, required: true },
                minOrderAmount: { type: Number }
            }
        ]
    },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
})

const quotaSchema = new mongoose.Schema({
    quotaId: { type: String, required: true },
    detail: { type: String, required: true },
    proCode: { type: String, required: true },
    id: { type: String,  },
    quotaGroup: { type: String, required: true },
    quotaWeight: { type: String, required: true },
    quota: { type: Number },
    quotaUse: { type: Number },
    area: { type: Array },
    zone: { type: Array },
    ExpDate : { type: String, required: true },
})

// const Promotion = dbCA.model('Promotion', promotionSchema)
// module.exports = { Promotion }
module.exports = (conn) => {
    return {
        Promotion: conn.model('Promotion', promotionSchema),
        PromotionLimit: conn.model('promotionlimit', promotionLimitSchema, 'promotionlimit'),
        Quota: conn.model('quota',quotaSchema,'quota')
    };
};