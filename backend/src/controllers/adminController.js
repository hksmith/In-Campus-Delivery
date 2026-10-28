import { Cafe, Order, Settings, User, WalletTransaction } from '../models/index.js';
import { ACTIVE_STATUSES, FINAL_STATUSES } from '../config/constants.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { assertObjectId, escapeRegex, parsePaging, pick, round2 } from '../utils/helpers.js';
import { startOfDay } from '../utils/time.js';
import { applyStatus, populateOrder, publishOrderEvent, viewFor } from '../services/orderService.js';
import { emitUserRefresh, resyncUserSockets } from '../services/realtime.js';
import { escapeHtml, money, sendMany, sendTo } from '../services/telegram.js';
import * as wallet from '../services/walletService.js';
import { completeDelivery } from './driverController.js';
import { validateRule } from '../services/pricing.js';
import { tr, reasonLine } from '../i18n/messages.js';

// ───────────────────────── Dashboard ─────────────────────────

async function revenueSince(since) {
  const [row] = await Order.aggregate([
    { $match: { status: 'delivered', deliveredAt: { $gte: since } } },
    {
      $group: {
        _id: null,
        orders: { $sum: 1 },
        gmv: { $sum: '$total' },
        platform: { $sum: '$platformEarning' },
        avgMinutes: { $avg: { $divide: [{ $subtract: ['$deliveredAt', '$createdAt'] }, 60000] } },
      },
    },
  ]);
  return {
    orders: row?.orders || 0,
    gmv: round2(row?.gmv || 0),
    platformEarning: round2(row?.platform || 0),
    avgDeliveryMinutes: Math.round(row?.avgMinutes || 0),
  };
}

export async function stats(req, res) {
  const tz = env.TIMEZONE;
  const todayStart = startOfDay(tz, 0);

  const [today, week, month, activeOrders, todayByStatus, usersByRole, onlineDrivers, pendingCafes, pendingDrivers] =
    await Promise.all([
      revenueSince(todayStart),
      revenueSince(startOfDay(tz, 6)),
      revenueSince(startOfDay(tz, 29)),
      Order.countDocuments({ status: { $in: ACTIVE_STATUSES } }),
      Order.aggregate([{ $match: { createdAt: { $gte: todayStart } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      User.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }]),
      User.countDocuments({ role: 'driver', 'driverProfile.status': 'approved', 'driverProfile.isOnline': true }),
      Cafe.countDocuments({ status: 'pending' }),
      User.countDocuments({ 'driverProfile.status': 'pending' }),
    ]);
  const [pendingTopUps, openIssues] = await Promise.all([
    WalletTransaction.countDocuments({ type: 'topup', status: 'pending' }),
    Order.countDocuments({ 'pickupIssue.reported': true, 'pickupIssue.resolved': false }),
  ]);

  const topCafes = await Order.aggregate([
    { $match: { status: 'delivered', deliveredAt: { $gte: startOfDay(tz, 29) } } },
    { $group: { _id: '$cafe', orders: { $sum: 1 }, sales: { $sum: '$subtotal' } } },
    { $sort: { orders: -1 } },
    { $limit: 5 },
    { $lookup: { from: 'cafes', localField: '_id', foreignField: '_id', as: 'cafe' } },
    { $project: { orders: 1, sales: 1, name: { $first: '$cafe.name' } } },
  ]);

  res.json({
    today,
    week,
    month,
    activeOrders,
    onlineDrivers,
    pendingCafes,
    pendingDrivers,
    pendingTopUps,
    openIssues,
    todayByStatus: Object.fromEntries(todayByStatus.map((r) => [r._id, r.n])),
    usersByRole: Object.fromEntries(usersByRole.map((r) => [r._id, r.n])),
    topCafes: topCafes.map((c) => ({ ...c, sales: round2(c.sales) })),
  });
}

// ───────────────────────── Orders ─────────────────────────

/** GET /api/admin/orders?scope=active|all&status=&search= */
export async function listOrders(req, res) {
  const { limit, skip } = parsePaging(req.query, 30);
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  else if (req.query.scope !== 'all') filter.status = { $in: ACTIVE_STATUSES };
  if (req.query.search && /^\d+$/.test(req.query.search)) filter.orderNumber = Number(req.query.search);
  if (req.query.cafe) filter.cafe = assertObjectId(req.query.cafe, 'cafe');
  if (req.query.driver) filter.driver = assertObjectId(req.query.driver, 'driver');
  if (req.query.issues === '1') {
    filter['pickupIssue.reported'] = true;
    filter['pickupIssue.resolved'] = false;
    delete filter.status;
  }

  const orders = await populateOrder(Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit));
  res.json({ orders: orders.map((o) => viewFor(o, 'admin')) });
}

async function loadOrder(id) {
  assertObjectId(id);
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');
  return order;
}

async function respond(res, id) {
  const order = await populateOrder(Order.findById(id));
  res.json({ order: viewFor(order, 'admin') });
}

export async function cancelOrder(req, res) {
  const order = await loadOrder(req.params.id);
  if (FINAL_STATUSES.includes(order.status)) throw ApiError.badRequest('Order is already finished');
  const reason = String(req.body.reason || 'Cancelled by admin').slice(0, 200);
  order.cancelReason = reason;
  order.cancelledBy = 'admin';
  applyStatus(order, 'cancelled', { by: req.user._id, note: reason });
  await order.save();
  publishOrderEvent(order._id, 'cancelled', { note: reason });
  await respond(res, order._id);
}

/** Remove the driver so others can claim it (driver disappeared, etc.) */
export async function releaseDriver(req, res) {
  const order = await loadOrder(req.params.id);
  if (!order.driver) throw ApiError.badRequest('No driver assigned');
  if (FINAL_STATUSES.includes(order.status)) throw ApiError.badRequest('Order is already finished');
  const previousDriverId = order.driver;
  order.driver = null;
  order.claimedAt = null;
  // If the food was already picked up, put it back to "ready" for the next driver
  if (order.status === 'picked_up') order.status = 'ready';
  order.statusHistory.push({ status: 'released', by: req.user._id, note: 'Released by admin' });
  await order.save();
  publishOrderEvent(order._id, 'released', { previousDriverId });
  await respond(res, order._id);
}

/** POST /api/admin/orders/:id/assign { driverId } */
export async function assignDriver(req, res) {
  const order = await loadOrder(req.params.id);
  if (FINAL_STATUSES.includes(order.status) || order.status === 'pending') {
    throw ApiError.badRequest('Only accepted, active orders can be assigned');
  }
  assertObjectId(req.body.driverId, 'driver');
  const driver = await User.findOne({ _id: req.body.driverId, role: 'driver', 'driverProfile.status': 'approved' });
  if (!driver) throw ApiError.badRequest('Driver not found or not approved');
  const only = order.delivery?.driverGender;
  if (['female', 'male'].includes(only) && driver.gender !== only) {
    throw ApiError.badRequest(only === 'female' ? 'This location is female-only. Choose a female driver.' : 'This location is male-only. Choose a male driver.');
  }
  const previousDriverId = order.driver && String(order.driver) !== String(driver._id) ? order.driver : null;
  order.driver = driver._id;
  order.claimedAt = new Date();
  order.statusHistory.push({ status: 'assigned', by: req.user._id, note: `Assigned to ${driver.displayName}` });
  await order.save();
  publishOrderEvent(order._id, 'assigned', { previousDriverId });
  await respond(res, order._id);
}

/** When a student lost their code / driver is locked out – admin confirms delivery */
export async function forceDeliver(req, res) {
  const order = await loadOrder(req.params.id);
  if (order.status !== 'picked_up') throw ApiError.badRequest('Only picked-up orders can be marked delivered');
  applyStatus(order, 'delivered', { by: req.user._id, note: 'Confirmed by admin' });
  order.paymentStatus = 'paid';
  await order.save();
  await completeDelivery(order);
  publishOrderEvent(order._id, 'delivered');
  await respond(res, order._id);
}

// ───────────────────────── Cafes ─────────────────────────

export async function listCafes(req, res) {
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  const cafes = await Cafe.find(filter).sort({ createdAt: -1 }).populate('owner', 'fullName username phone telegramId');
  res.json({ cafes: cafes.map((c) => c.toJSON()) });
}

/** PATCH /api/admin/cafes/:id/status { status: approved|rejected|suspended, reason } */
export async function setCafeStatus(req, res) {
  assertObjectId(req.params.id);
  const { status, reason } = req.body;
  if (!['approved', 'rejected', 'suspended'].includes(status)) throw ApiError.badRequest('Invalid status');
  const cafe = await Cafe.findById(req.params.id);
  if (!cafe) throw ApiError.notFound('Cafe not found');
  const owner = await User.findById(cafe.owner);
  if (!owner) throw ApiError.notFound('Cafe owner not found');

  if (status === 'approved') {
    if (!['customer', 'cafe_owner'].includes(owner.role)) {
      throw ApiError.badRequest(`The owner currently has the "${owner.role}" role. Change it first.`);
    }
    owner.role = 'cafe_owner';
    owner.cafe = cafe._id;
    await owner.save();
    cafe.rejectionReason = undefined;
  } else if (status === 'rejected') {
    if (cafe.status !== 'pending') throw ApiError.badRequest('Only pending cafes can be rejected; suspend instead');
    cafe.rejectionReason = String(reason || '').slice(0, 300);
  } else if (status === 'suspended') {
    cafe.isAcceptingOrders = false;
    cafe.rejectionReason = String(reason || '').slice(0, 300);
  }

  const wasPending = cafe.status === 'pending';
  cafe.status = status;
  cafe.reviewedAt = new Date();
  await cafe.save();

  emitUserRefresh(owner._id);
  resyncUserSockets(owner._id);
  const key = { approved: wasPending ? 'cafeApproved' : 'cafeReactivated', rejected: 'cafeRejected', suspended: 'cafeSuspended' }[status];
  sendTo(
    owner,
    (lang) => tr(lang, key, { name: escapeHtml(cafe.name), reason: reasonLine(lang, reason, escapeHtml) }),
    status === 'approved' ? { button: { key: 'btnDashboard', path: '/cafe/menu' } } : {}
  );

  res.json({ cafe: cafe.toJSON() });
}

/** PATCH /api/admin/cafes/:id/commission { type, value } – a special rate for one cafe; { reset: true } = back to default */
export async function setCafeCommission(req, res) {
  assertObjectId(req.params.id);
  const cafe = await Cafe.findById(req.params.id);
  if (!cafe) throw ApiError.notFound('Cafe not found');
  if (req.body.reset) {
    cafe.commission = undefined;
  } else {
    const err = validateRule(req.body, 'Cafe commission');
    if (err) throw ApiError.badRequest(err);
    cafe.commission = { type: req.body.type, value: Number(req.body.value) };
  }
  await cafe.save();
  res.json({ cafe: cafe.toJSON() });
}

// ───────────────────────── Drivers ─────────────────────────

export async function listDrivers(req, res) {
  const filter = req.query.status
    ? { 'driverProfile.status': String(req.query.status) }
    : { 'driverProfile.status': { $ne: 'none' } };
  const drivers = await User.find(filter)
    .sort({ 'driverProfile.appliedAt': -1 })
    .select('fullName firstName username phone studentId userType gender telegramId role driverProfile createdAt');
  res.json({ drivers: drivers.map((d) => d.toJSON()) });
}

/** PATCH /api/admin/drivers/:id/status { status: approved|rejected|suspended, reason } */
export async function setDriverStatus(req, res) {
  assertObjectId(req.params.id);
  const { status, reason } = req.body;
  if (!['approved', 'rejected', 'suspended'].includes(status)) throw ApiError.badRequest('Invalid status');
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  if (status === 'approved') {
    if (!['customer', 'driver'].includes(user.role)) {
      throw ApiError.badRequest(`This user has the "${user.role}" role and cannot be a driver`);
    }
    user.role = 'driver';
  } else if (status === 'rejected') {
    if (user.driverProfile.status !== 'pending') throw ApiError.badRequest('Only pending applications can be rejected');
  } else if (status === 'suspended') {
    user.driverProfile.isOnline = false;
    const busy = await Order.exists({ driver: user._id, status: { $in: ['accepted', 'preparing', 'ready', 'picked_up'] } });
    if (busy) throw ApiError.badRequest('Driver has active deliveries. Release or reassign them first.');
  }
  user.driverProfile.status = status;
  user.driverProfile.reviewedAt = new Date();
  user.driverProfile.rejectionReason = reason ? String(reason).slice(0, 300) : undefined;
  await user.save();

  emitUserRefresh(user._id);
  resyncUserSockets(user._id);
  const key = { approved: 'driverApproved', rejected: 'driverRejected', suspended: 'driverSuspended' }[status];
  sendTo(
    user,
    (lang) => tr(lang, key, { reason: reasonLine(lang, reason, escapeHtml) }),
    status === 'approved' ? { button: { key: 'btnStartDelivering', path: '/driver/earnings' } } : {}
  );

  res.json({ driver: user.toJSON() });
}

// ───────────────────────── Users ─────────────────────────

export async function listUsers(req, res) {
  const { limit, skip } = parsePaging(req.query, 30);
  const filter = {};
  if (req.query.role) filter.role = String(req.query.role);
  if (req.query.search) {
    const re = new RegExp(escapeRegex(String(req.query.search).trim()), 'i');
    filter.$or = [{ fullName: re }, { username: re }, { phone: re }, { firstName: re }, { studentId: re }];
  }
  const users = await User.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('cafe', 'name');
  res.json({ users: users.map((u) => u.toJSON()) });
}

/** PATCH /api/admin/users/:id { isBanned, banReason, role: "customer" } */
export async function updateUser(req, res) {
  assertObjectId(req.params.id);
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  if (env.ADMIN_TELEGRAM_IDS.includes(user.telegramId)) throw ApiError.badRequest('You cannot change a super admin');

  const data = pick(req.body, ['isBanned', 'banReason', 'role', 'gender']);
  if (['male', 'female'].includes(data.gender)) user.gender = data.gender;
  if (data.isBanned !== undefined) {
    user.isBanned = Boolean(data.isBanned);
    user.banReason = user.isBanned ? String(data.banReason || '').slice(0, 300) : undefined;
    if (user.isBanned && user.role === 'driver') user.driverProfile.isOnline = false;
  }
  if (data.role !== undefined) {
    // Only demotion to a normal customer is supported here; promotions go through applications
    if (data.role !== 'customer') throw ApiError.badRequest('Users can only be reset to customer here');
    if (user.role === 'cafe_owner') throw ApiError.badRequest('Suspend the cafe instead of changing the owner role');
    if (user.role === 'driver') {
      const busy = await Order.exists({ driver: user._id, status: { $in: ['accepted', 'preparing', 'ready', 'picked_up'] } });
      if (busy) throw ApiError.badRequest('Driver has active deliveries');
      user.driverProfile.status = 'none';
      user.driverProfile.isOnline = false;
    }
    user.role = 'customer';
    user.cafe = undefined;
  }
  await user.save();
  emitUserRefresh(user._id);
  resyncUserSockets(user._id);
  res.json({ user: user.toJSON() });
}

// ───────────────────────── Settings ─────────────────────────

export async function getSettings(req, res) {
  res.json({ settings: await Settings.getSettings() });
}

export async function updateSettings(req, res) {
  const data = pick(req.body, [
    'commissionType',
    'commissionValue',
    'deliveryCutType',
    'deliveryCutValue',
    'driverCreditLimit',
    'minTopUp',
    'lowBalanceAlert',
    'paymentInstructions',
    'isPlatformOpen',
    'closedMessage',
    'announcement',
  ]);
  for (const [type, value, label] of [
    ['commissionType', 'commissionValue', 'Cafe commission'],
    ['deliveryCutType', 'deliveryCutValue', 'Delivery fee cut'],
  ]) {
    if (data[type] !== undefined || data[value] !== undefined) {
      const current = await Settings.getSettings();
      const err = validateRule({ type: data[type] ?? current[type], value: data[value] ?? current[value] }, label);
      if (err) throw ApiError.badRequest(err);
    }
  }
  const settings = await Settings.findOneAndUpdate({ key: 'global' }, { $set: data }, { new: true, upsert: true, runValidators: true });
  Settings.clearCache();
  res.json({ settings });
}

// ───────────────────────── Driver wallets ─────────────────────────

/** GET /api/admin/topups?status=pending */
export async function listTopUps(req, res) {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  const topups = await WalletTransaction.find({ type: 'topup', status })
    .sort({ createdAt: status === 'pending' ? 1 : -1 })
    .limit(100)
    .populate('driver', 'fullName firstName username phone driverProfile.walletBalance')
    .select('-referenceKey')
    .lean();
  res.json({ topups });
}

export async function approveTopUp(req, res) {
  assertObjectId(req.params.id);
  const { tx } = await wallet.approveTopUp(req.params.id, req.user, req.body.amount);
  res.json({ transaction: tx });
}

/** POST /api/admin/topups/:id/recheck – run the Telebirr/CBE receipt check again */
export async function recheckTopUp(req, res) {
  assertObjectId(req.params.id);
  const result = await wallet.recheckTopUp(req.params.id);
  res.json({ outcome: result.outcome, reason: result.reason || '', transaction: result.transaction });
}

export async function rejectTopUp(req, res) {
  assertObjectId(req.params.id);
  const tx = await wallet.rejectTopUp(req.params.id, req.user, req.body.reason);
  const driver = await User.findById(tx.driver).select('telegramId botBlocked language');
  sendTo(driver, (lang) =>
    tr(lang, 'topupRejected', { amount: money(tx.amount), reason: escapeHtml(tx.rejectionReason || '-') })
  );
  res.json({ transaction: tx });
}

/** GET /api/admin/wallets – every driver's balance (negative = owes the platform) */
export async function listWallets(req, res) {
  const drivers = await User.find({ 'driverProfile.status': { $in: ['approved', 'suspended'] } })
    .sort({ 'driverProfile.walletBalance': 1 })
    .select('fullName firstName username phone gender driverProfile')
    .lean();
  const [totals] = await WalletTransaction.aggregate([
    { $match: { type: 'order_fee' } },
    { $group: { _id: null, earned: { $sum: { $multiply: ['$amount', -1] } } } },
  ]);
  const held = drivers.reduce((s, d) => s + (d.driverProfile?.walletBalance || 0), 0);
  res.json({ drivers, platformEarnedAllTime: round2(totals?.earned || 0), prepaidHeld: round2(held) });
}

/** GET /api/admin/wallets/:id – one driver's ledger */
export async function driverLedger(req, res) {
  assertObjectId(req.params.id);
  const driver = await User.findById(req.params.id).select('fullName firstName username phone driverProfile').lean();
  if (!driver) throw ApiError.notFound('Driver not found');
  const transactions = await WalletTransaction.find({ driver: driver._id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ driver, transactions });
}

/** POST /api/admin/wallets/:id/adjust { amount, note, type: adjustment|refund } */
export async function adjustWallet(req, res) {
  assertObjectId(req.params.id);
  const { tx, driver } = await wallet.adjustWallet(req.params.id, req.user, req.body);
  emitUserRefresh(driver._id);
  res.json({ transaction: tx });
}

/** POST /api/admin/orders/:id/resolve-issue – cafe's "driver didn't pay" report handled */
export async function resolvePickupIssue(req, res) {
  const order = await loadOrder(req.params.id);
  if (!order.pickupIssue?.reported) throw ApiError.badRequest('No issue reported on this order');
  order.pickupIssue.resolved = true;
  order.statusHistory.push({ status: 'issue_resolved', by: req.user._id, note: String(req.body.note || '').slice(0, 200) });
  await order.save();
  await respond(res, order._id);
}

// ───────────────────────── Broadcast ─────────────────────────

/** POST /api/admin/broadcast { audience: all|customers|drivers|cafes, message } */
export async function broadcast(req, res) {
  const message = String(req.body.message || '').trim();
  if (message.length < 2) throw ApiError.badRequest('Message is empty');
  if (message.length > 3500) throw ApiError.badRequest('Message is too long');

  const roleFilter = {
    all: {},
    customers: { role: 'customer' },
    drivers: { role: 'driver' },
    cafes: { role: { $in: ['cafe_owner', 'cafe_staff'] } },
  }[req.body.audience || 'all'];
  if (!roleFilter) throw ApiError.badRequest('Invalid audience');

  const users = await User.find({ ...roleFilter, isBanned: false, botBlocked: false }).select('telegramId botBlocked language').lean();

  // Send in the background so the request returns immediately
  sendMany(users, `📢 ${escapeHtml(message)}`, { button: { key: 'btnOpenApp', path: '/' } }).then((sent) =>
    console.log(`Broadcast sent to ${sent}/${users.length} users`)
  );

  res.json({ queued: users.length });
}
