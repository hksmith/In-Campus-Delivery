import mongoose from 'mongoose';
import { ORDER_STATUS_LIST, CANCELLED_BY } from '../config/constants.js';

const { Schema } = mongoose;

/** Snapshot of the item at the time of ordering (menu prices may change later) */
const orderItemSchema = new Schema(
  {
    menuItem: { type: Schema.Types.ObjectId, ref: 'MenuItem' },
    name: { type: String, required: true },
    basePrice: { type: Number, required: true },
    options: [{ _id: false, name: String, price: Number }],
    unitPrice: { type: Number, required: true }, // basePrice + options
    quantity: { type: Number, required: true, min: 1 },
    note: { type: String, maxlength: 140 },
  },
  { _id: false }
);

const historySchema = new Schema(
  {
    status: String, // order status or an event like "claimed" / "released"
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    note: String,
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    orderNumber: { type: Number, required: true, unique: true },
    customer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    cafe: { type: Schema.Types.ObjectId, ref: 'Cafe', required: true, index: true },
    driver: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    items: { type: [orderItemSchema], validate: (v) => v.length > 0 },

    // ── Money (snapshotted at order time) ──
    subtotal: { type: Number, required: true }, // food total → goes to the cafe
    deliveryFee: { type: Number, required: true },
    total: { type: Number, required: true }, // what the student pays in cash
    commission: { type: Number, default: 0 }, // platform cut from the cafe
    driverEarning: { type: Number, default: 0 }, // driver's share of the delivery fee
    platformEarning: { type: Number, default: 0 }, // commission + rest of delivery fee → taken from the driver's wallet
    /** What the driver pays the cafe in cash at pickup (subtotal − commission) */
    cafePayout: { type: Number, default: 0 },

    delivery: {
      location: { type: Schema.Types.ObjectId, ref: 'Location' },
      locationName: String,
      details: { type: String, maxlength: 120 }, // room / floor / landmark
      phone: String,
      recipientName: String,
      driverGender: { type: String, enum: ['any', 'female', 'male'], default: 'any' },
    },
    note: { type: String, maxlength: 200 }, // note to the cafe

    status: { type: String, enum: ORDER_STATUS_LIST, default: 'pending', index: true },
    statusHistory: { type: [historySchema], default: [] },

    /** 4-digit code the student gives the driver to confirm delivery */
    deliveryCode: { type: String, select: false },
    deliveryCodeAttempts: { type: Number, default: 0, select: false },

    paymentMethod: { type: String, enum: ['cash_on_delivery'], default: 'cash_on_delivery' },
    paymentStatus: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' },

    estimatedReadyAt: Date,
    acceptedAt: Date,
    preparingAt: Date,
    readyAt: Date,
    claimedAt: Date,
    pickedUpAt: Date,
    deliveredAt: Date,
    cancelledAt: Date,

    cancelReason: { type: String, maxlength: 200 },
    cancelledBy: { type: String, enum: CANCELLED_BY },

    /** Cafe says the driver did not pay at pickup → admin investigates */
    pickupIssue: {
      reported: { type: Boolean, default: false },
      note: { type: String, maxlength: 200 },
      at: Date,
      resolved: { type: Boolean, default: false },
    },

    isReviewed: { type: Boolean, default: false },
    unclaimedAlertSent: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    // Two people changing the same order at the same time → second save fails (409) instead of overwriting
    optimisticConcurrency: true,
  }
);

orderSchema.index({ status: 1, driver: 1, createdAt: -1 });
orderSchema.index({ cafe: 1, status: 1, createdAt: -1 });
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ driver: 1, status: 1, deliveredAt: -1 });

export const Order = mongoose.model('Order', orderSchema);
