import mongoose from 'mongoose';
import { LOCATION_TYPES } from '../config/constants.js';

/** A delivery drop-off point (dorm block, building, library, gate…). Its delivery fee comes from its AREA. */
const locationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    type: { type: String, enum: LOCATION_TYPES, default: 'other' },
    description: { type: String, trim: true, maxlength: 200 }, // e.g. "Drop at the main gate"
    /** Which delivery area it is in (fee is set on the area). Empty = the first/default area. */
    area: { type: mongoose.Schema.Types.ObjectId, ref: 'Area' },
    deliveryFee: { type: Number, min: 0 }, // old – fees now come from the area
    /** Who may deliver here: any driver, or only female / only male drivers (single-gender dorms) */
    driverGender: { type: String, enum: ['any', 'female', 'male'], default: 'any' },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

locationSchema.index({ isActive: 1, sortOrder: 1, name: 1 });

export const Location = mongoose.model('Location', locationSchema);
