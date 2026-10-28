import mongoose from 'mongoose';
import { LOCATION_TYPES } from '../config/constants.js';

/** A delivery drop-off point on campus (dorm block, building, library, gate…) */
const locationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    type: { type: String, enum: LOCATION_TYPES, default: 'other' },
    description: { type: String, trim: true, maxlength: 200 }, // e.g. "Drop at the main gate"
    deliveryFee: { type: Number, required: true, min: 0 },
    /** Who may deliver here: any driver, or only female / only male drivers (single-gender dorms) */
    driverGender: { type: String, enum: ['any', 'female', 'male'], default: 'any' },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

locationSchema.index({ isActive: 1, sortOrder: 1, name: 1 });

export const Location = mongoose.model('Location', locationSchema);
