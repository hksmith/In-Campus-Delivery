import { Order, Settings, User, WalletTransaction, normaliseReference } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { round2 } from '../utils/helpers.js';
import { AUTO_METHODS, payToDetails, verifyTopUpReceipt } from './payments/index.js';
import { emitTo, emitUserRefresh, rooms } from './realtime.js';
import { escapeHtml, money, notifyAdmins, sendTo } from './telegram.js';
import { tr } from '../i18n/messages.js';

/**
 * Driver prepaid wallet.
 *
 * Money flow per order (cash on delivery):
 *   student pays driver ............ total            (subtotal + deliveryFee)
 *   driver pays cafe at pickup ..... cafePayout       (subtotal − commission)
 *   driver keeps in hand ........... deliveryFee + commission
 *   wallet is charged .............. platformEarning  (commission + platform part of delivery fee)
 *   → driver's real earning ........ driverEarning
 *
 * Drivers top up in advance by Telebirr / CBE. The top-up is verified automatically against the
 * official receipt (services/payments) and credited instantly; otherwise the admin reviews it.
 */

const DRIVER_ACTIVE = ['accepted', 'preparing', 'ready', 'picked_up'];

/** Platform cuts already reserved by the driver's current (undelivered) orders */
async function reservedFor(driverId) {
  const [row] = await Order.aggregate([
    { $match: { driver: driverId, status: { $in: DRIVER_ACTIVE } } },
    { $group: { _id: null, sum: { $sum: '$platformEarning' } } },
  ]);
  return round2(row?.sum || 0);
}

export async function walletSummary(driver) {
  const settings = await Settings.getSettings();
  const balance = round2(driver.driverProfile?.walletBalance || 0);
  const reserved = await reservedFor(driver._id);
  return {
    balance,
    reserved,
    creditLimit: settings.driverCreditLimit,
    available: round2(balance + settings.driverCreditLimit - reserved),
    minTopUp: settings.minTopUp,
    lowBalanceAlert: settings.lowBalanceAlert,
    isLow: balance <= settings.lowBalanceAlert,
    paymentInstructions: settings.paymentInstructions,
    payTo: payToDetails(),
  };
}

/** Throws if the driver's wallet can't cover the platform cut of this order */
export async function assertCanTake(driver, order) {
  const summary = await walletSummary(driver);
  if (summary.available < order.platformEarning) {
    throw new ApiError(
      402,
      `Your wallet balance is too low for this order (needs ${order.platformEarning}, available ${summary.available}). Top up first.`,
      { code: 'WALLET_LOW' }
    );
  }
}

/** Bot message when the balance crosses the low-balance line (only once per crossing) */
async function maybeWarnLowBalance(driverId, before, after) {
  const { lowBalanceAlert } = await Settings.getSettings();
  if (before > lowBalanceAlert && after <= lowBalanceAlert) {
    const driver = await User.findById(driverId).select('telegramId botBlocked language');
    sendTo(driver, (lang) => tr(lang, 'walletLow', { balance: money(after) }), {
      button: { key: 'btnTopUp', path: '/driver/earnings' },
    });
  }
}

/** Takes the platform cut for a delivered order. Safe to call twice – charges only once. */
export async function chargeOrderFee(order) {
  if (!order.driver || !order.platformEarning) return;
  let tx;
  try {
    tx = await WalletTransaction.create({
      driver: order.driver,
      type: 'order_fee',
      amount: -order.platformEarning,
      order: order._id,
      note: `Order #${order.orderNumber}`,
    });
  } catch (err) {
    if (err.code === 11000) return; // already charged
    throw err;
  }
  const user = await User.findByIdAndUpdate(
    order.driver,
    { $inc: { 'driverProfile.walletBalance': -order.platformEarning } },
    { new: true }
  ).select('driverProfile.walletBalance');
  const after = round2(user?.driverProfile?.walletBalance ?? 0);
  tx.balanceAfter = after;
  await tx.save();
  emitUserRefresh(order.driver);
  await maybeWarnLowBalance(order.driver, round2(after + order.platformEarning), after);
}

/** Admin (or the automatic checker when `admin` is null) credits a pending top-up */
export async function approveTopUp(txId, admin, approvedAmount) {
  const tx = await WalletTransaction.findOne({ _id: txId, type: 'topup' });
  if (!tx) throw ApiError.notFound('Top-up not found');
  if (tx.status !== 'pending') throw ApiError.badRequest(`Top-up is already ${tx.status}`);

  const amount = approvedAmount !== undefined && approvedAmount !== '' && approvedAmount !== null ? round2(Number(approvedAmount)) : tx.amount;
  if (!Number.isFinite(amount) || amount <= 0) throw ApiError.badRequest('Invalid amount');

  // Atomic status change – two admins (or admin + auto-check) can't approve the same top-up twice
  const updated = await WalletTransaction.findOneAndUpdate(
    { _id: tx._id, status: 'pending' },
    { $set: { status: 'approved', amount, reviewedBy: admin?._id, reviewedAt: new Date() } },
    { new: true }
  );
  if (!updated) throw ApiError.conflict('Someone else already handled this top-up');

  const user = await User.findByIdAndUpdate(
    updated.driver,
    { $inc: { 'driverProfile.walletBalance': amount } },
    { new: true }
  );
  updated.balanceAfter = round2(user.driverProfile.walletBalance);
  await updated.save();

  emitUserRefresh(user._id);
  emitTo(rooms.admins, 'admin:topups', {});
  sendTo(user, (lang) =>
    tr(lang, 'topupApproved', { amount: money(amount), balance: money(user.driverProfile.walletBalance) })
  , { button: { key: 'btnSeeDeliveries', path: '/driver' } });
  return { tx: updated, driver: user };
}

export async function rejectTopUp(txId, admin, reason) {
  const tx = await WalletTransaction.findOneAndUpdate(
    { _id: txId, type: 'topup', status: 'pending' },
    {
      $set: {
        status: 'rejected',
        rejectionReason: String(reason || '').slice(0, 200),
        reviewedBy: admin?._id,
        reviewedAt: new Date(),
      },
      $unset: { referenceKey: 1 }, // allow the driver to submit correct details again
    },
    { new: true }
  );
  if (!tx) throw ApiError.badRequest('Top-up not found or already handled');
  emitUserRefresh(tx.driver);
  emitTo(rooms.admins, 'admin:topups', {});
  return tx;
}

/** Runs the receipt check on a pending top-up and approves / rejects / leaves it for the admin */
async function runVerification(tx, { minAmount }) {
  const result = await verifyTopUpReceipt({
    method: tx.method,
    reference: tx.reference,
    accountSuffix: tx.accountSuffix,
    minAmount,
  });
  const r = result.receipt || {};
  tx.verification = {
    status: result.outcome,
    provider: result.provider,
    reason: result.reason,
    payerName: r.payerName,
    receiverName: r.receiverName,
    receiverAccount: r.receiverAccount,
    receiptAmount: r.amount ?? undefined,
    receiptDate: r.date ?? undefined,
    receiptStatus: r.status,
    checkedAt: new Date(),
  };
  if (r.amount) tx.amount = round2(r.amount); // always trust the receipt amount, never the typed one
  await tx.save();

  if (result.outcome === 'verified') {
    const { tx: approved } = await approveTopUp(tx._id, null, tx.amount);
    return { outcome: 'verified', transaction: approved };
  }
  if (result.outcome === 'failed') {
    const rejected = await rejectTopUp(tx._id, null, result.reason);
    return { outcome: 'failed', transaction: rejected, reason: result.reason };
  }
  return { outcome: result.outcome, transaction: tx, reason: result.reason };
}

/**
 * Driver submits a payment they already made.
 * Telebirr / CBE → checked automatically (only the transaction ID is needed).
 * Cash / other bank → waits for the admin.
 */
export async function requestTopUp(driver, { amount, method, reference, accountSuffix, proofImage }) {
  const settings = await Settings.getSettings();
  const auto = AUTO_METHODS.includes(method);
  const key = normaliseReference(reference);

  if (!['telebirr', 'cbe', 'bank', 'cash', 'other'].includes(method)) throw ApiError.badRequest('Choose how you paid');
  if (method !== 'cash' && key.length < 6) {
    throw ApiError.badRequest('Enter the transaction ID from your payment SMS / receipt');
  }
  let value = round2(Number(amount) || 0);
  if (!auto) {
    if (value <= 0) throw ApiError.badRequest('Enter the amount you sent');
    if (value < settings.minTopUp) throw ApiError.badRequest(`Minimum top-up is ${settings.minTopUp}`);
  }
  if (value > 100000) throw ApiError.badRequest('Amount is too large');

  const pending = await WalletTransaction.countDocuments({ driver: driver._id, type: 'topup', status: 'pending' });
  if (pending >= 3) throw ApiError.badRequest('You already have top-ups waiting for approval');

  let tx;
  try {
    tx = await WalletTransaction.create({
      driver: driver._id,
      type: 'topup',
      status: 'pending',
      amount: value || settings.minTopUp, // replaced by the receipt amount after the check
      method,
      reference: reference ? String(reference).trim().toUpperCase().slice(0, 60) : undefined,
      referenceKey: key || undefined, // unique → the same receipt can never be used twice
      accountSuffix: accountSuffix ? String(accountSuffix).replace(/\D/g, '').slice(-8) : undefined,
      proofImage: proofImage || undefined,
      createdBy: driver._id,
      verification: { status: auto ? undefined : 'manual' },
    });
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('This transaction ID was already used');
    throw err;
  }

  let result = { outcome: 'review', transaction: tx };
  if (auto) result = await runVerification(tx, { minAmount: settings.minTopUp });

  if (['review', 'unavailable'].includes(result.outcome)) {
    emitTo(rooms.admins, 'admin:topups', {});
    notifyAdmins(
      (lang) =>
        tr(lang, result.outcome === 'unavailable' ? 'topupCheckDown' : auto ? 'topupReview' : 'topupRequest', {
          name: escapeHtml(driver.displayName),
          amount: money(result.transaction.amount),
          method: escapeHtml(method),
          ref: tx.reference ? ` · ${escapeHtml(tx.reference)}` : '',
          reason: escapeHtml(result.reason || ''),
        }),
      { button: { key: 'btnReview', path: '/admin/money' } }
    );
  }
  return result;
}

/** Admin: run the automatic check again (e.g. after Telebirr was down) */
export async function recheckTopUp(txId) {
  const tx = await WalletTransaction.findOne({ _id: txId, type: 'topup', status: 'pending' });
  if (!tx) throw ApiError.badRequest('Top-up not found or already handled');
  if (!AUTO_METHODS.includes(tx.method)) throw ApiError.badRequest('Only Telebirr and CBE payments can be checked automatically');
  const settings = await Settings.getSettings();
  return runVerification(tx, { minAmount: settings.minTopUp });
}

/** Manual correction (+ or −) or refund by the admin */
export async function adjustWallet(driverId, admin, { amount, note, type = 'adjustment' }) {
  const value = round2(Number(amount));
  if (!Number.isFinite(value) || value === 0) throw ApiError.badRequest('Enter a non-zero amount');
  if (!['adjustment', 'refund'].includes(type)) throw ApiError.badRequest('Invalid type');
  if (!String(note || '').trim()) throw ApiError.badRequest('Add a note explaining why');
  const signed = type === 'refund' ? -Math.abs(value) : value;

  const user = await User.findOneAndUpdate(
    { _id: driverId, 'driverProfile.status': { $ne: 'none' } },
    { $inc: { 'driverProfile.walletBalance': signed } },
    { new: true }
  );
  if (!user) throw ApiError.notFound('Driver not found');
  const tx = await WalletTransaction.create({
    driver: user._id,
    type,
    amount: signed,
    note: String(note).slice(0, 200),
    createdBy: admin._id,
    reviewedBy: admin._id,
    reviewedAt: new Date(),
    balanceAfter: round2(user.driverProfile.walletBalance),
  });
  const after = round2(user.driverProfile.walletBalance);
  await maybeWarnLowBalance(user._id, round2(after - signed), after);
  return { tx, driver: user };
}
