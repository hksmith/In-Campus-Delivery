import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Every change to a driver's prepaid wallet.
 *  topup      +  driver sent money to the platform (Telebirr/CBE/cash), admin verified it
 *  order_fee  −  platform cut taken automatically when an order is delivered
 *  adjustment ±  manual correction by the admin
 *  refund     −  admin returned wallet money to the driver (e.g. driver quits)
 */
const walletTransactionSchema = new Schema(
  {
    driver: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['topup', 'order_fee', 'adjustment', 'refund'], required: true },
    amount: { type: Number, required: true }, // positive adds to wallet, negative takes away
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved', index: true },

    // Top-up details
    method: { type: String, enum: ['telebirr', 'cbe', 'bank', 'cash', 'other'] },
    reference: { type: String, trim: true, maxlength: 60 }, // transaction ID from the SMS/receipt
    /** Normalised reference – unique, so the same receipt can never be used twice. Removed if rejected. */
    referenceKey: { type: String },
    proofImage: String, // screenshot of the receipt
    accountSuffix: { type: String, maxlength: 8 }, // CBE: last 8 digits of the payer's account (if needed)
    /** Result of the automatic receipt check against Telebirr / CBE */
    verification: {
      status: { type: String, enum: ['verified', 'failed', 'unavailable', 'review', 'manual'] },
      provider: String, // direct | relay | verifyet
      reason: String,
      payerName: String,
      receiverName: String,
      receiverAccount: String,
      receiptAmount: Number,
      receiptDate: Date,
      receiptStatus: String,
      checkedAt: Date,
    },
    rejectionReason: { type: String, maxlength: 200 },

    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    balanceAfter: Number,
    note: { type: String, maxlength: 200 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
  },
  { timestamps: true }
);

walletTransactionSchema.index({ driver: 1, createdAt: -1 });
walletTransactionSchema.index({ referenceKey: 1 }, { unique: true, sparse: true });
// The platform cut is taken exactly once per order
walletTransactionSchema.index(
  { order: 1 },
  { unique: true, partialFilterExpression: { type: 'order_fee' } }
);

export const normaliseReference = (ref) =>
  String(ref || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

export const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);
