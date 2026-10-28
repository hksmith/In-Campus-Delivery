import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Extra/option a customer can tick, e.g. "Extra egg (+10)" */
const optionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    price: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const menuItemSchema = new Schema(
  {
    cafe: { type: Schema.Types.ObjectId, ref: 'Cafe', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300 },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, trim: true, maxlength: 40, default: 'Other' },
    image: String,
    options: { type: [optionSchema], default: [] },
    isAvailable: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false }, // soft delete keeps old orders readable
  },
  { timestamps: true }
);

menuItemSchema.index({ cafe: 1, isDeleted: 1, category: 1, sortOrder: 1 });
menuItemSchema.index({ name: 'text', description: 'text', category: 'text' });

export const MenuItem = mongoose.model('MenuItem', menuItemSchema);
