import mongoose from 'mongoose';

/**
 * A delivery area with ONE delivery fee, set by the admin.
 * e.g. "Campus & around" = 15 ETB, "Gubre" = 30 ETB. The admin can add more.
 * Every cafe belongs to one area, and so does every delivery place (dorm, building…).
 */
const areaSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 200 },
    deliveryFee: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

areaSchema.index({ isActive: 1, sortOrder: 1, name: 1 });

export const Area = mongoose.model('Area', areaSchema);
