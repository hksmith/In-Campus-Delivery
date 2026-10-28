import mongoose from 'mongoose';
import { Cafe, Order, User, WalletTransaction } from '../models/index.js';
import { POOL_STATUSES } from '../config/constants.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { assertObjectId, parsePaging, round2 } from '../utils/helpers.js';
import { startOfDay } from '../utils/time.js';
import { applyStatus, populateOrder, publishOrderEvent, viewFor } from '../services/orderService.js';
import { translateError } from '../i18n/errors.js';
import { assertCanTake, chargeOrderFee, requestTopUp, walletSummary } from '../services/walletService.js';

const MY_ACTIVE = ['accepted', 'preparing', 'ready', 'picked_up'];

/** Single-gender drop-offs: a driver only sees places open to everyone or to their own gender */
const genderFilter = (driver) => ({
  'delivery.driverGender': { $in: ['any', null, ...(['female', 'male'].includes(driver.gender) ? [driver.gender] : [])] },
});

/** PATCH /api/driver/status { isOnline } */
export async function setOnline(req, res) {
  const user = req.user;
  user.driverProfile.isOnline = Boolean(req.body.isOnline);
  await user.save();
  res.json({ user: user.toJSON() });
}

/** GET /api/driver/available – orders nobody has claimed yet */
export async function available(req, res) {
  const orders = await populateOrder(
    Order.find({ status: { $in: POOL_STATUSES }, driver: null, ...genderFilter(req.user) })
      .sort({ acceptedAt: 1 })
      .limit(50)
  );
  res.json({ orders: orders.map((o) => viewFor(o, 'driver-pool')), wallet: await walletSummary(req.user) });
}

/** GET /api/driver/active – my current deliveries */
export async function active(req, res) {
  const orders = await populateOrder(
    Order.find({ driver: req.user._id, status: { $in: MY_ACTIVE } }).sort({ claimedAt: 1 })
  );
  res.json({ orders: orders.map((o) => viewFor(o, 'driver')) });
}

/** GET /api/driver/history */
export async function history(req, res) {
  const { limit, skip } = parsePaging(req.query, 30);
  const orders = await populateOrder(
    Order.find({ driver: req.user._id, status: { $in: ['delivered', 'cancelled'] } })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
  );
  res.json({ orders: orders.map((o) => viewFor(o, 'driver')) });
}

async function earningsSince(driverId, since) {
  const [row] = await Order.aggregate([
    { $match: { driver: driverId, status: 'delivered', deliveredAt: { $gte: since } } },
    { $group: { _id: null, deliveries: { $sum: 1 }, earnings: { $sum: '$driverEarning' } } },
  ]);
  return { deliveries: row?.deliveries || 0, earnings: round2(row?.earnings || 0) };
}

/** GET /api/driver/earnings */
export async function earnings(req, res) {
  const driverId = new mongoose.Types.ObjectId(String(req.user._id));
  const tz = env.TIMEZONE;
  const [today, week, month, allTime, wallet] = await Promise.all([
    earningsSince(driverId, startOfDay(tz, 0)),
    earningsSince(driverId, startOfDay(tz, 6)),
    earningsSince(driverId, startOfDay(tz, 29)),
    earningsSince(driverId, new Date(0)),
    walletSummary(req.user),
  ]);
  res.json({
    today,
    week,
    month,
    allTime,
    wallet,
    rating: req.user.driverProfile.rating,
    ratingCount: req.user.driverProfile.ratingCount,
  });
}

// ───────────────────────── Wallet ─────────────────────────

/** GET /api/driver/wallet – balance + recent transactions */
export async function wallet(req, res) {
  const transactions = await WalletTransaction.find({ driver: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .select('-referenceKey')
    .lean();
  res.json({ wallet: await walletSummary(req.user), transactions });
}

/**
 * POST /api/driver/wallet/topups { method, reference, accountSuffix?, amount?, proofImage? }
 * Telebirr / CBE are checked against the official receipt right away.
 * Response: { outcome: verified | failed | review | unavailable, reason, transaction, wallet }
 */
export async function topUp(req, res) {
  const result = await requestTopUp(req.user, req.body);
  const fresh = await User.findById(req.user._id);
  res.status(201).json({
    outcome: result.outcome,
    reason: translateError(result.reason || '', req.user.language),
    transaction: result.transaction,
    wallet: await walletSummary(fresh),
  });
}

// ───────────────────────── Order actions ─────────────────────────

async function respond(res, orderId) {
  const order = await populateOrder(Order.findById(orderId));
  res.json({ order: viewFor(order, 'driver') });
}

/** POST /api/driver/orders/:id/claim – first driver to tap gets the order */
export async function claim(req, res) {
  assertObjectId(req.params.id);
  const me = req.user;
  if (!me.driverProfile.isOnline) throw ApiError.badRequest('Go online first to take deliveries');

  const count = await Order.countDocuments({ driver: me._id, status: { $in: MY_ACTIVE } });
  if (count >= env.MAX_ACTIVE_DELIVERIES_PER_DRIVER) {
    throw ApiError.badRequest(`You can carry at most ${env.MAX_ACTIVE_DELIVERIES_PER_DRIVER} orders at once`);
  }

  const target = await Order.findById(req.params.id).select('platformEarning delivery.driverGender');
  if (!target) throw ApiError.notFound('Order not found');
  const only = target.delivery?.driverGender;
  if (['female', 'male'].includes(only) && me.gender !== only) {
    throw ApiError.forbidden(only === 'female' ? 'Only female drivers can deliver to this location' : 'Only male drivers can deliver to this location');
  }
  await assertCanTake(me, target);

  // Atomic: only succeeds if the order is still unclaimed
  const order = await Order.findOneAndUpdate(
    { _id: req.params.id, driver: null, status: { $in: POOL_STATUSES } },
    {
      $set: { driver: me._id, claimedAt: new Date() },
      $push: { statusHistory: { status: 'claimed', at: new Date(), by: me._id } },
      $inc: { __v: 1 },
    },
    { new: true }
  );
  if (!order) throw ApiError.conflict('Another driver already took this order');

  publishOrderEvent(order._id, 'claimed');
  await respond(res, order._id);
}

/** POST /api/driver/orders/:id/release – give the order back before pickup */
export async function release(req, res) {
  assertObjectId(req.params.id);
  const order = await Order.findOneAndUpdate(
    { _id: req.params.id, driver: req.user._id, status: { $in: POOL_STATUSES } },
    {
      $set: { driver: null, claimedAt: null },
      $push: { statusHistory: { status: 'released', at: new Date(), by: req.user._id } },
      $inc: { __v: 1 },
    },
    { new: true }
  );
  if (!order) throw ApiError.badRequest('You can only release orders you have not picked up yet');
  publishOrderEvent(order._id, 'released');
  res.json({ ok: true });
}

/** POST /api/driver/orders/:id/pickup – driver has the food and paid the cafe */
export async function pickup(req, res) {
  assertObjectId(req.params.id);
  const order = await Order.findOne({ _id: req.params.id, driver: req.user._id });
  if (!order) throw ApiError.notFound('Order not found');
  if (!POOL_STATUSES.includes(order.status)) throw ApiError.badRequest(`Order is ${order.status.replace('_', ' ')}`);
  if (!order.readyAt) order.readyAt = new Date(); // cafe forgot to press "ready"
  applyStatus(order, 'picked_up', { by: req.user._id, note: `Paid cafe ${order.cafePayout}` });
  await order.save();
  publishOrderEvent(order._id, 'picked_up');
  await respond(res, order._id);
}

/** POST /api/driver/orders/:id/deliver { code } – student tells the driver their 4-digit code */
export async function deliver(req, res) {
  assertObjectId(req.params.id);
  const order = await Order.findOne({ _id: req.params.id, driver: req.user._id }).select(
    '+deliveryCode +deliveryCodeAttempts'
  );
  if (!order) throw ApiError.notFound('Order not found');
  if (order.status !== 'picked_up') throw ApiError.badRequest('Mark the order as picked up first');

  if (order.deliveryCodeAttempts >= env.DELIVERY_CODE_MAX_ATTEMPTS) {
    throw new ApiError(423, 'Too many wrong codes. Ask the admin to confirm this delivery.');
  }
  const code = String(req.body.code || '').trim();
  if (code !== order.deliveryCode) {
    order.deliveryCodeAttempts += 1;
    await order.save();
    const left = env.DELIVERY_CODE_MAX_ATTEMPTS - order.deliveryCodeAttempts;
    throw ApiError.badRequest(`Wrong code. ${left} attempt${left === 1 ? '' : 's'} left.`);
  }

  applyStatus(order, 'delivered', { by: req.user._id });
  order.paymentStatus = 'paid';
  await order.save();
  await completeDelivery(order);

  publishOrderEvent(order._id, 'delivered');
  await respond(res, order._id);
}

/** Shared by driver delivery and admin "mark delivered" */
export async function completeDelivery(order) {
  await chargeOrderFee(order);
  await Promise.all([
    User.updateOne({ _id: order.driver }, { $inc: { 'driverProfile.totalDeliveries': 1 } }),
    Cafe.updateOne({ _id: order.cafe }, { $inc: { totalOrders: 1 } }),
  ]);
}
