import mongoose from 'mongoose';

/** Single document holding platform-wide settings the admin can change from the app */
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global', unique: true },
    /** Commission taken from cafes on the food price: 'percent' (value %) or 'fixed' (value birr per order).
     *  A cafe can have its own rule (Cafe.commission) that overrides this default. */
    commissionType: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
    commissionValue: { type: Number, default: 10, min: 0 },
    /** Platform's cut of each delivery fee: 'percent' or 'fixed' birr. The driver keeps the rest. */
    deliveryCutType: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
    deliveryCutValue: { type: Number, default: 20, min: 0 },
    /**
     * How far below zero a driver's wallet may go before they can't take orders.
     * 0 = strict prepaid (recommended). e.g. 100 = drivers may owe up to 100 ETB.
     */
    driverCreditLimit: { type: Number, default: 0, min: 0 },
    minTopUp: { type: Number, default: 100, min: 0 },
    /** Driver gets a "low balance" message when the wallet drops to this amount or below */
    lowBalanceAlert: { type: Number, default: 10, min: 0 },
    /** Shown to drivers on the top-up screen, e.g. "Telebirr 0911 000 000 – Abebe K." */
    paymentInstructions: { type: String, default: '', maxlength: 500 },
    /** Master switch to stop all new orders (holidays, exams, emergencies) */
    isPlatformOpen: { type: Boolean, default: true },
    closedMessage: { type: String, default: 'We are closed right now. Please check back later.', maxlength: 200 },
    /** Banner shown on the customer home screen */
    announcement: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: true }
);

let cache = null;
let cacheAt = 0;

settingsSchema.statics.getSettings = async function getSettings() {
  if (cache && Date.now() - cacheAt < 30_000) return cache;
  cache = await this.findOneAndUpdate(
    { key: 'global' },
    { $setOnInsert: { key: 'global' } },
    { upsert: true, new: true }
  ).lean();
  cacheAt = Date.now();
  return cache;
};

settingsSchema.statics.clearCache = () => {
  cache = null;
};

export const Settings = mongoose.model('Settings', settingsSchema);
