import mongoose from 'mongoose';

const { Schema } = mongoose;

const reviewSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    customer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    cafe: { type: Schema.Types.ObjectId, ref: 'Cafe', required: true, index: true },
    driver: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    cafeRating: { type: Number, required: true, min: 1, max: 5 },
    driverRating: { type: Number, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 500 },
    reply: { type: String, trim: true, maxlength: 500 }, // cafe owner's reply
    repliedAt: Date,
  },
  { timestamps: true }
);

reviewSchema.index({ cafe: 1, createdAt: -1 });

export const Review = mongoose.model('Review', reviewSchema);
