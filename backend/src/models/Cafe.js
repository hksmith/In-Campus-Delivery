import mongoose from 'mongoose';
import { CAFE_STATUS } from '../config/constants.js';
import { env } from '../config/env.js';
import { isWithinHours } from '../utils/time.js';
import { TIME_RE } from '../utils/helpers.js';

const { Schema } = mongoose;

/** A field named "type" must live in its own sub-schema, or Mongoose reads it as the field's type */
const commissionSchema = new Schema(
  {
    type: { type: String, enum: ['percent', 'fixed'], required: true },
    value: { type: Number, min: 0, required: true },
  },
  { _id: false }
);

const cafeSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 400 },
    logo: String,
    phone: { type: String, trim: true, maxlength: 20 },
    campusSpot: { type: String, trim: true, maxlength: 120 }, // where the cafe is on campus

    openingTime: { type: String, default: '07:00', match: TIME_RE },
    closingTime: { type: String, default: '21:00', match: TIME_RE },
    /** Manual switch: owner/staff can pause orders (busy, out of stock, closed early) */
    isAcceptingOrders: { type: Boolean, default: true },
    prepTimeMinutes: { type: Number, default: 15, min: 1, max: 180 },
    minOrderAmount: { type: Number, default: 0, min: 0 },

    /** Admin-set commission for this cafe only (empty = platform default) */
    commission: { type: commissionSchema, default: undefined },

    status: { type: String, enum: CAFE_STATUS, default: 'pending', index: true },
    rejectionReason: { type: String, maxlength: 300 },
    reviewedAt: Date,

    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

/** Open right now = approved + accepting orders + inside opening hours */
cafeSchema.virtual('isOpen').get(function isOpen() {
  return (
    this.status === 'approved' &&
    this.isAcceptingOrders &&
    isWithinHours(this.openingTime, this.closingTime, env.TIMEZONE)
  );
});

export const Cafe = mongoose.model('Cafe', cafeSchema);
