import mongoose from 'mongoose';
import { Cafe, Order, Review, User, WalletTransaction } from '../models/index.js';
import { POOL_STATUSES } from '../config/constants.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { assertObjectId, parsePaging, round2 } from '../utils/helpers.js';
import { startOfDay } from '../utils/time.js';
import { applyStatus, placeText, poolFilterFor, populateOrder, publishOrderEvent, viewFor } from '../services/orderService.js';
import { escapeHtml, money, sendTo } from '../services/telegram.js';
import { tr } from '../i18n/messages.js';
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
  const wasOnline = user.driverProfile.isOnline;
  user.driverProfile.isOnline = Boolean(req.body.isOnline);
  await user.save();
  res.json({ user: user.toJSON() });
  // Just went online → send the deliveries that are waiting right now (in the background)
  if (!wasOnline && user.driverProfile.isOnline) sendWaitingDeliveries(user).catch(() => {});
}

const ONLINE_LIST_MAX = 5;

/** Telegram message listing the deliveries a driver can take right now */
async function sendWaitingDeliveries(user) {
  const filter = poolFilterFor(user);
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ acceptedAt: 1 }).limit(ONLINE_LIST_MAX).populate('cafe', 'name').lean(),
    Order.countDocuments(filter),
  ]);
  const button = { key: 'btnSeeDeliveries', path: '/driver' };
  if (!orders.length) return sendTo(user, (lang) => tr(lang, 'onlineNone'), { button });
  return sendTo(
    user,
    (lang) => {
      const list = orders
        .map((o) =>
          tr(lang, 'onlineListItem', { cafe: escapeHtml(o.cafe?.name), place: placeText(o), earn: money(o.driverEarning) })
        )
        .join('\n\n');
      const more = total > orders.length ? tr(lang, 'onlineListMore', { n: total - orders.length }) : '';
      return tr(lang, 'onlineList', { list: list + more });
    },
    { button }
  );
}

/** GET /api/driver/available – orders nobody has claimed yet */
export async function available(req, res) {
  const [orders, wallet] = await Promise.all([
    populateOrder(
      Order.find({ status: { $in: POOL_STATUSES }, driver: null, ...genderFilter(req.user) })
        .sort({ acceptedAt: 1 })
        .limit(50)
    ),
    walletSummary(req.user),
  ]);
  res.json({ orders: orders.map((o) => viewFor(o, 'driver-pool')), wallet });
}

/** GET /api/driver/active – my current deliveries */
export async function active(req, res) {
  const orders = await populateOrder(
    Order.find({ driver: req.user._id, status: { $in: MY_ACTIVE } }).sort({ claimedAt: 1 })
  );
  res.json({ orders: orders.map((o) => viewFor(o, 'driver')) });
}

/** GET /api/driver/history?page=1&limit=20 – my finished deliveries (delivered + cancelled), newest first */
export async function history(req, res) {
  const { page, limit, skip } = parsePaging(req.query, 20);
  // Fetch one extra row to know whether another page exists
  const orders = await populateOrder(
    Order.find({ driver: req.user._id, status: { $in: ['delivered', 'cancelled'] } })
      .sort({ updatedAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit + 1)
  );
  const hasMore = orders.length > limit;
  const rows = orders.slice(0, limit).map((o) => {
    const v = viewFor(o, 'driver');
    // The job is over – the driver no longer needs the student's phone number
    if (v.delivery) delete v.delivery.phone;
    if (v.customer) delete v.customer.phone;
    return v;
  });
  res.json({ orders: rows, page, hasMore });
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

// ───────────────────────── Ratings ─────────────────────────

/** GET /api/driver/reviews?page=1 – how students rated my deliveries */
export async function reviews(req, res) {
  const { page, limit, skip } = parsePaging(req.query, 20);
  const driverId = new mongoose.Types.ObjectId(String(req.user._id));
  const match = { driver: driverId, driverRating: { $gte: 1 } };

  const [rows, counts] = await Promise.all([
    Review.find(match)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit + 1)
      .select('order customer driverRating comment createdAt')
      .populate('customer', 'firstName')
      .populate('order', 'orderNumber')
      .lean(),
    page === 1 ? Review.aggregate([{ $match: match }, { $group: { _id: '$driverRating', n: { $sum: 1 } } }]) : null,
  ]);

  const hasMore = rows.length > limit;
  const list = rows.slice(0, limit).map((r) => ({
    _id: r._id,
    rating: r.driverRating,
    comment: r.comment,
    customer: r.customer ? { firstName: r.customer.firstName } : null,
    orderNumber: r.order?.orderNumber,
    createdAt: r.createdAt,
  }));

  const body = { reviews: list, page, hasMore };
  if (counts) {
    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const c of counts) breakdown[c._id] = c.n;
    Object.assign(body, {
      rating: req.user.driverProfile.rating,
      ratingCount: req.user.driverProfile.ratingCount,
      breakdown,
    });
  }
  res.json(body);
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
