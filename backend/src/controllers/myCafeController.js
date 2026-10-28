import mongoose from 'mongoose';
import { Cafe, MenuItem, Order, Review, Settings, User } from '../models/index.js';
import { commissionRuleFor } from '../services/pricing.js';
import { ACTIVE_STATUSES } from '../config/constants.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { ah, assertObjectId, parsePaging, pick, round2, TIME_RE } from '../utils/helpers.js';
import { startOfDay } from '../utils/time.js';
import { applyStatus, populateOrder, publishOrderEvent, viewFor } from '../services/orderService.js';
import { emitUserRefresh, resyncUserSockets } from '../services/realtime.js';
import { sendTo, escapeHtml } from '../services/telegram.js';
import { tr } from '../i18n/messages.js';

/** Middleware: loads req.cafe for cafe_owner / cafe_staff */
export const loadMyCafe = ah(async (req, res, next) => {
  if (!['cafe_owner', 'cafe_staff'].includes(req.user.role) || !req.user.cafe) {
    throw ApiError.forbidden('Cafe accounts only');
  }
  const cafe = await Cafe.findById(req.user.cafe);
  if (!cafe) throw ApiError.notFound('Your cafe was not found');
  if (cafe.status === 'suspended') throw ApiError.forbidden('Your cafe is suspended. Contact the admin.');
  req.cafe = cafe;
  next();
});

export const ownerOnly = (req, res, next) => {
  if (req.user.role !== 'cafe_owner') return next(ApiError.forbidden('Only the cafe owner can do this'));
  next();
};

// ───────────────────────── Cafe profile ─────────────────────────

export async function getMyCafe(req, res) {
  const settings = await Settings.getSettings();
  const { type, value } = commissionRuleFor(req.cafe, settings);
  res.json({ cafe: req.cafe.toJSON(), commission: { type, value } });
}

export async function updateMyCafe(req, res) {
  const data = pick(req.body, [
    'name',
    'description',
    'logo',
    'phone',
    'campusSpot',
    'openingTime',
    'closingTime',
    'prepTimeMinutes',
    'minOrderAmount',
  ]);
  for (const t of ['openingTime', 'closingTime']) {
    if (data[t] && !TIME_RE.test(data[t])) throw ApiError.badRequest(`${t} must look like 08:00`);
  }
  Object.assign(req.cafe, data);
  await req.cafe.save();
  res.json({ cafe: req.cafe.toJSON() });
}

/** PATCH /api/my-cafe/accepting { isAcceptingOrders } – owner or staff */
export async function setAccepting(req, res) {
  req.cafe.isAcceptingOrders = Boolean(req.body.isAcceptingOrders);
  await req.cafe.save();
  res.json({ cafe: req.cafe.toJSON() });
}

// ───────────────────────── Menu ─────────────────────────

const MENU_FIELDS = ['name', 'description', 'price', 'category', 'image', 'options', 'isAvailable', 'sortOrder'];

function cleanOptions(options) {
  if (options === undefined) return undefined;
  if (!Array.isArray(options)) throw ApiError.badRequest('options must be a list');
  return options
    .filter((o) => o && String(o.name || '').trim())
    .slice(0, 20)
    .map((o) => ({ name: String(o.name).trim().slice(0, 60), price: Math.max(0, Number(o.price) || 0) }));
}

export async function listMenu(req, res) {
  const items = await MenuItem.find({ cafe: req.cafe._id, isDeleted: false })
    .sort({ category: 1, sortOrder: 1, name: 1 })
    .lean();
  res.json({ items });
}

export async function createMenuItem(req, res) {
  const data = pick(req.body, MENU_FIELDS);
  data.options = cleanOptions(data.options) || [];
  const item = await MenuItem.create({ ...data, cafe: req.cafe._id });
  res.status(201).json({ item });
}

async function findMyItem(req) {
  assertObjectId(req.params.itemId, 'menu item');
  const item = await MenuItem.findOne({ _id: req.params.itemId, cafe: req.cafe._id, isDeleted: false });
  if (!item) throw ApiError.notFound('Menu item not found');
  return item;
}

export async function updateMenuItem(req, res) {
  const item = await findMyItem(req);
  const data = pick(req.body, MENU_FIELDS);
  if (data.options !== undefined) data.options = cleanOptions(data.options);
  Object.assign(item, data);
  await item.save();
  res.json({ item });
}

/** PATCH /api/my-cafe/menu/:itemId/availability – owner or staff (sold out toggle) */
export async function setItemAvailability(req, res) {
  const item = await findMyItem(req);
  item.isAvailable = Boolean(req.body.isAvailable);
  await item.save();
  res.json({ item });
}

export async function deleteMenuItem(req, res) {
  const item = await findMyItem(req);
  item.isDeleted = true;
  item.isAvailable = false;
  await item.save();
  res.json({ ok: true });
}

// ───────────────────────── Orders ─────────────────────────

/** GET /api/my-cafe/orders?scope=active|history */
export async function listOrders(req, res) {
  const filter = { cafe: req.cafe._id };
  let query;
  if (req.query.scope === 'history') {
    const { limit, skip } = parsePaging(req.query, 30);
    filter.status = { $nin: ACTIVE_STATUSES };
    query = Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
  } else {
    filter.status = { $in: ACTIVE_STATUSES };
    query = Order.find(filter).sort({ createdAt: 1 });
  }
  const orders = await populateOrder(query);
  res.json({ orders: orders.map((o) => viewFor(o, 'cafe')) });
}

async function findCafeOrder(req, allowedStatuses) {
  assertObjectId(req.params.id);
  const order = await Order.findOne({ _id: req.params.id, cafe: req.cafe._id });
  if (!order) throw ApiError.notFound('Order not found');
  if (allowedStatuses && !allowedStatuses.includes(order.status)) {
    throw ApiError.badRequest(`This order is already ${order.status.replace('_', ' ')}`);
  }
  return order;
}

async function respond(res, orderId) {
  const order = await populateOrder(Order.findById(orderId));
  res.json({ order: viewFor(order, 'cafe') });
}

/** POST /api/my-cafe/orders/:id/accept { prepTimeMinutes? } */
export async function acceptOrder(req, res) {
  const order = await findCafeOrder(req, ['pending']);
  const prep = Number(req.body.prepTimeMinutes) || req.cafe.prepTimeMinutes;
  order.estimatedReadyAt = new Date(Date.now() + Math.min(180, Math.max(1, prep)) * 60000);
  applyStatus(order, 'accepted', { by: req.user._id });
  await order.save();
  publishOrderEvent(order._id, 'accepted');
  await respond(res, order._id);
}

/** POST /api/my-cafe/orders/:id/reject { reason } */
export async function rejectOrder(req, res) {
  const order = await findCafeOrder(req, ['pending']);
  const reason = String(req.body.reason || '').trim().slice(0, 200) || 'The cafe could not take this order';
  order.cancelReason = reason;
  order.cancelledBy = 'cafe';
  applyStatus(order, 'rejected', { by: req.user._id, note: reason });
  await order.save();
  publishOrderEvent(order._id, 'rejected', { note: reason });
  await respond(res, order._id);
}

export async function markPreparing(req, res) {
  const order = await findCafeOrder(req, ['accepted']);
  applyStatus(order, 'preparing', { by: req.user._id });
  await order.save();
  publishOrderEvent(order._id, 'preparing');
  await respond(res, order._id);
}

export async function markReady(req, res) {
  const order = await findCafeOrder(req, ['accepted', 'preparing']);
  applyStatus(order, 'ready', { by: req.user._id });
  await order.save();
  publishOrderEvent(order._id, 'ready');
  await respond(res, order._id);
}

/** Cafe cancels after accepting (ran out of food etc.) – not possible once picked up */
export async function cancelOrder(req, res) {
  const order = await findCafeOrder(req, ['accepted', 'preparing', 'ready']);
  const reason = String(req.body.reason || '').trim().slice(0, 200);
  if (!reason) throw ApiError.badRequest('Please give a reason so the student understands');
  order.cancelReason = reason;
  order.cancelledBy = 'cafe';
  applyStatus(order, 'cancelled', { by: req.user._id, note: reason });
  await order.save();
  publishOrderEvent(order._id, 'cancelled', { note: reason });
  await respond(res, order._id);
}

/** POST /api/my-cafe/orders/:id/report-unpaid { note } – driver took the food without paying */
export async function reportUnpaid(req, res) {
  const order = await findCafeOrder(req, ['picked_up', 'delivered']);
  if (order.pickupIssue?.reported) throw ApiError.badRequest('Already reported – the admin is on it');
  order.pickupIssue = {
    reported: true,
    note: String(req.body.note || '').trim().slice(0, 200),
    at: new Date(),
    resolved: false,
  };
  order.statusHistory.push({ status: 'issue_reported', by: req.user._id, note: order.pickupIssue.note });
  await order.save();
  publishOrderEvent(order._id, 'pickup_issue');
  await respond(res, order._id);
}

// ───────────────────────── Staff ─────────────────────────

export async function listStaff(req, res) {
  const staff = await User.find({ cafe: req.cafe._id, role: 'cafe_staff' })
    .select('fullName firstName username phone')
    .lean();
  res.json({ staff });
}

/** POST /api/my-cafe/staff { username } – person must have opened the app once */
export async function addStaff(req, res) {
  const username = String(req.body.username || '')
    .trim()
    .replace(/^@/, '');
  if (!username) throw ApiError.badRequest('Enter the Telegram username');
  const user = await User.findOne({ username: new RegExp(`^${username.replace(/[^\w]/g, '')}$`, 'i') });
  if (!user) {
    throw ApiError.notFound('No user with that username. Ask them to open the app once first.');
  }
  if (user.role !== 'customer') throw ApiError.badRequest('This user already has another role');
  user.role = 'cafe_staff';
  user.cafe = req.cafe._id;
  await user.save();
  emitUserRefresh(user._id);
  resyncUserSockets(user._id);
  sendTo(user, (lang) => tr(lang, 'staffAdded', { cafe: escapeHtml(req.cafe.name) }), {
    button: { key: 'btnOpenOrders', path: '/cafe/orders' },
  });
  res.status(201).json({ staff: { _id: user._id, fullName: user.fullName, firstName: user.firstName, username: user.username } });
}

export async function removeStaff(req, res) {
  assertObjectId(req.params.userId, 'user');
  const user = await User.findOne({ _id: req.params.userId, cafe: req.cafe._id, role: 'cafe_staff' });
  if (!user) throw ApiError.notFound('Staff member not found');
  user.role = 'customer';
  user.cafe = undefined;
  await user.save();
  emitUserRefresh(user._id);
  resyncUserSockets(user._id);
  res.json({ ok: true });
}

// ───────────────────────── Stats & reviews ─────────────────────────

async function salesSince(cafeId, since) {
  const [row] = await Order.aggregate([
    { $match: { cafe: cafeId, status: 'delivered', deliveredAt: { $gte: since } } },
    {
      $group: {
        _id: null,
        orders: { $sum: 1 },
        sales: { $sum: '$subtotal' },
        commission: { $sum: '$commission' },
        received: { $sum: '$cafePayout' },
      },
    },
  ]);
  return {
    orders: row?.orders || 0,
    sales: round2(row?.sales || 0),
    commission: round2(row?.commission || 0),
    net: round2(row?.received || 0), // cash the cafe received from drivers
  };
}

export async function stats(req, res) {
  const cafeId = new mongoose.Types.ObjectId(String(req.cafe._id));
  const tz = env.TIMEZONE;
  const [today, week, month] = await Promise.all([
    salesSince(cafeId, startOfDay(tz, 0)),
    salesSince(cafeId, startOfDay(tz, 6)),
    salesSince(cafeId, startOfDay(tz, 29)),
  ]);

  const topItems = await Order.aggregate([
    { $match: { cafe: cafeId, status: 'delivered', deliveredAt: { $gte: startOfDay(tz, 29) } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.name',
        quantity: { $sum: '$items.quantity' },
        revenue: { $sum: { $multiply: ['$items.unitPrice', '$items.quantity'] } },
      },
    },
    { $sort: { quantity: -1 } },
    { $limit: 5 },
  ]);

  const [statusCounts, todayRejected] = await Promise.all([
    Order.countDocuments({ cafe: cafeId, status: { $in: ACTIVE_STATUSES } }),
    Order.countDocuments({
      cafe: cafeId,
      status: { $in: ['rejected', 'cancelled'] },
      createdAt: { $gte: startOfDay(tz, 0) },
    }),
  ]);

  res.json({
    today,
    week,
    month,
    activeOrders: statusCounts,
    cancelledToday: todayRejected,
    topItems: topItems.map((t) => ({ name: t._id, quantity: t.quantity, revenue: round2(t.revenue) })),
    rating: req.cafe.rating,
    ratingCount: req.cafe.ratingCount,
  });
}

export async function listReviews(req, res) {
  const reviews = await Review.find({ cafe: req.cafe._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('customer', 'firstName')
    .lean();
  res.json({ reviews });
}

export async function replyReview(req, res) {
  assertObjectId(req.params.reviewId, 'review');
  const review = await Review.findOne({ _id: req.params.reviewId, cafe: req.cafe._id });
  if (!review) throw ApiError.notFound('Review not found');
  review.reply = String(req.body.reply || '').trim().slice(0, 500);
  review.repliedAt = new Date();
  await review.save();
  res.json({ review });
}
