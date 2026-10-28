import mongoose from 'mongoose';
import { LOCATION_TYPES } from '../config/constants.js';

/** A delivery drop-off point on campus (dorm block, building, library, gate…) */
const locationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    type: { type: String, enum: LOCATION_TYPES, default: 'other' },
    description: { type: String, trim: true, maxlength: 200 }, // e.g. "Drop at the main gate"
    deliveryFee: { type: Number, required: true, min: 0 },
    /** Only female drivers can deliver here (e.g. female dorms) */
    femaleOnly: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

locationSchema.index({ isActive: 1, sortOrder: 1, name: 1 });

export const Location = mongoose.model('Location', locationSchema);
