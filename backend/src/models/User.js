import mongoose from 'mongoose';
import { ROLE_LIST, DRIVER_STATUS } from '../config/constants.js';

const { Schema } = mongoose;

export const USER_TYPES = ['student', 'teacher', 'staff', 'other'];
export const START_CHOICES = ['order', 'deliver', 'cafe'];

const driverProfileSchema = new Schema(
  {
    status: { type: String, enum: DRIVER_STATUS, default: 'none' },
    idNumber: { type: String, trim: true, maxlength: 40 }, // student / national ID number
    idImage: { type: String }, // photo of the ID card
    appliedAt: Date,
    reviewedAt: Date,
    rejectionReason: { type: String, maxlength: 300 },
    isOnline: { type: Boolean, default: false },
    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    totalDeliveries: { type: Number, default: 0 },
    /** Prepaid balance. The platform's cut is taken from here on every delivery. */
    walletBalance: { type: Number, default: 0 },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    // ── From Telegram ──
    telegramId: { type: Number, required: true, unique: true, index: true },
    username: String,
    firstName: String,
    lastName: String,
    photoUrl: String,
    languageCode: String,

    // ── Profile filled in the app ──
    fullName: { type: String, trim: true, maxlength: 80 },
    phone: { type: String, trim: true, maxlength: 20 },
    studentId: { type: String, trim: true, maxlength: 40 },
    defaultLocation: { type: Schema.Types.ObjectId, ref: 'Location' },
    defaultLocationDetails: { type: String, trim: true, maxlength: 120 }, // room / floor / landmark
    gender: { type: String, enum: ['male', 'female'] }, // required for drivers (single-gender dorms)
    language: { type: String, enum: ['en', 'am'], default: 'en' },
    userType: { type: String, enum: USER_TYPES }, // student / teacher / staff / other
    /** What they picked on the "What do you want to do?" screen (order / deliver / cafe) */
    startChoice: { type: String, enum: START_CHOICES },
    /** True once they passed the "What do you want to do?" screen */
    onboarded: { type: Boolean, default: false },

    // ── Access ──
    role: { type: String, enum: ROLE_LIST, default: 'customer', index: true },
    cafe: { type: Schema.Types.ObjectId, ref: 'Cafe' }, // for cafe_owner / cafe_staff
    driverProfile: { type: driverProfileSchema, default: () => ({}) },

    isBanned: { type: Boolean, default: false },
    banReason: { type: String, maxlength: 300 },
    botBlocked: { type: Boolean, default: false }, // user blocked the bot → can't message them
    lastSeenAt: Date,
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

userSchema.virtual('isProfileComplete').get(function isProfileComplete() {
  return Boolean(this.fullName && this.phone);
});

userSchema.virtual('displayName').get(function displayName() {
  return this.fullName || [this.firstName, this.lastName].filter(Boolean).join(' ') || this.username || 'User';
});

userSchema.index({ role: 1, 'driverProfile.status': 1, 'driverProfile.isOnline': 1 });
userSchema.index({ username: 1 });

export const User = mongoose.model('User', userSchema);
