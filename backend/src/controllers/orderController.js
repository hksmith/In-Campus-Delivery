import crypto from 'node:crypto';
import { Cafe, MenuItem, Order, Review, Settings, User, nextSequence } from '../models/index.js';
import { resolveArea } from '../services/areas.js';
import { parsePlace, placeLabel } from '../services/places.js';
import { ACTIVE_STATUSES } from '../config/constants.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { priceOrder } from '../services/pricing.js';
import { assertObjectId, parsePaging, round2 } from '../utils/helpers.js';
import { applyStatus, newAverage, populateOrder, publishOrderEvent, viewFor } from '../services/orderService.js';

/**
 * POST /api/orders – place an order (customer)
 * body: { cafeId, items: [{ menuItemId, quantity, options: [optionName], note }],
 *         useSaved: true            → deliver to my dorm (students save it at sign-up)
 *      or place: { kind: 'dorm', block, room, gender }   → another dorm
 *      or place: { kind: 'place', text, details }         → anywhere else (typed)
 *         details, note, saveAsDefault }
 * Delivery fee = the delivery fee of the CAFE's area (Campus & around, Gubre…).
 */
export async function createOrder(req, res) {
  const user = req.user;
  const { cafeId, items, useSaved, place: placeInput, details, note, saveAsDefault } = req.body;

  const settings = await Settings.getSettings();
  if (!settings.isPlatformOpen) throw ApiError.badRequest(settings.closedMessage);

  assertObjectId(cafeId, 'cafe');
  if (!Array.isArray(items) || items.length === 0) throw ApiError.badRequest('Your cart is empty');
  if (items.length > 30) throw ApiError.badRequest('Too many items in one order');

  const cafe = await Cafe.findById(cafeId);
  if (!cafe || cafe.status !== 'approved') throw ApiError.notFound('Cafe not found');
  if (!cafe.isOpen) throw ApiError.badRequest(`${cafe.name} is not taking orders right now`);

  // Where to deliver: my saved dorm, or another dorm / place typed at checkout
  let place;
  if (useSaved) {
    const sp = user.savedPlace;
    if (!sp?.kind) throw ApiError.badRequest('Enter your dorm or usual delivery place');
    place = parsePlace({ ...sp.toObject?.() ?? sp, gender: user.gender, details: details ?? sp.details });
  } else {
    place = parsePlace({ ...placeInput, details: details ?? placeInput?.details });
  }

  // The delivery fee comes from the cafe's area
  const cafeArea = await resolveArea(cafe.area);
  if (!cafeArea) throw ApiError.badRequest('Delivery areas are not set up yet – please tell the admin');

  const activeCount = await Order.countDocuments({ customer: user._id, status: { $in: ACTIVE_STATUSES } });
  if (activeCount >= env.MAX_ACTIVE_ORDERS_PER_CUSTOMER) {
    throw ApiError.badRequest(`You can have at most ${env.MAX_ACTIVE_ORDERS_PER_CUSTOMER} active orders`);
  }

  // Load menu items and price everything on the server (never trust client prices)
  const ids = items.map((i) => assertObjectId(i.menuItemId, 'menu item'));
  const menuItems = await MenuItem.find({ _id: { $in: ids }, cafe: cafe._id, isDeleted: false });
  const byId = new Map(menuItems.map((m) => [String(m._id), m]));

  const lines = items.map((line) => {
    const mi = byId.get(String(line.menuItemId));
    if (!mi) throw ApiError.badRequest('An item in your cart no longer exists. Please refresh the menu.');
    if (!mi.isAvailable) throw ApiError.badRequest(`${mi.name} is sold out`);
    const quantity = Number.parseInt(line.quantity, 10);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw ApiError.badRequest(`Invalid quantity for ${mi.name}`);
    }
    const wanted = new Set(Array.isArray(line.options) ? line.options.map(String) : []);
    const options = mi.options.filter((o) => wanted.has(o.name)).map((o) => ({ name: o.name, price: o.price }));
    const unitPrice = round2(mi.price + options.reduce((s, o) => s + o.price, 0));
    return {
      menuItem: mi._id,
      name: mi.name,
      basePrice: mi.price,
      options,
      unitPrice,
      quantity,
      note: line.note ? String(line.note).slice(0, 140) : undefined,
    };
  });

  const subtotal = round2(lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0));
  if (subtotal < cafe.minOrderAmount) {
    throw ApiError.badRequest(`Minimum order at ${cafe.name} is ${cafe.minOrderAmount} ${env.CURRENCY}`);
  }
  const deliveryFee = round2(cafeArea.deliveryFee);
  const money = priceOrder({ subtotal, deliveryFee, cafe, settings });

  const order = new Order({
    orderNumber: await nextSequence('order'),
    customer: user._id,
    cafe: cafe._id,
    items: lines,
    subtotal,
    deliveryFee,
    total: money.total,
    commission: money.commission,
    driverEarning: money.driverEarning,
    platformEarning: money.platformEarning,
    cafePayout: money.cafePayout,
    delivery: {
      kind: place.kind,
      block: place.block,
      room: place.room,
      locationName: placeLabel(place),
      details: place.details,
      phone: user.phone,
      recipientName: user.fullName,
      // Dorms are single-gender → only a driver of the same gender can deliver there
      driverGender: place.kind === 'dorm' ? place.gender : 'any',
    },
    note: note ? String(note).slice(0, 200) : undefined,
    deliveryCode: String(crypto.randomInt(1000, 10000)),
  });
  applyStatus(order, 'pending', { by: user._id });
  await order.save();

  // Students can save another dorm as their dorm
  if (saveAsDefault && !useSaved && place.kind === 'dorm') {
    await User.updateOne(
      { _id: user._id },
      { savedPlace: { kind: 'dorm', block: place.block, room: place.room }, gender: place.gender }
    );
  }

  publishOrderEvent(order._id, 'created');

  const full = await populateOrder(Order.findById(order._id).select('+deliveryCode'));
  res.status(201).json({ order: viewFor(full, 'customer') });
}

/** GET /api/orders – my orders (?scope=active|past) */
export async function myOrders(req, res) {
  const { limit, skip } = parsePaging(req.query, 20);
  const filter = { customer: req.user._id };
  if (req.query.scope === 'active') filter.status = { $in: ACTIVE_STATUSES };
  if (req.query.scope === 'past') filter.status = { $nin: ACTIVE_STATUSES };

  const orders = await populateOrder(Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit));
  res.json({ orders: orders.map((o) => viewFor(o, 'customer')) });
}

/** GET /api/orders/:id – my order (includes delivery code) */
export async function getMyOrder(req, res) {
  assertObjectId(req.params.id);
  const order = await populateOrder(
    Order.findOne({ _id: req.params.id, customer: req.user._id }).select('+deliveryCode')
  );
  if (!order) throw ApiError.notFound('Order not found');
  const review = order.isReviewed ? await Review.findOne({ order: order._id }).lean() : null;
  res.json({ order: viewFor(order, 'customer'), review });
}

/** POST /api/orders/:id/cancel – customers can cancel only before the cafe accepts */
export async function cancelMyOrder(req, res) {
  assertObjectId(req.params.id);
  const order = await Order.findOne({ _id: req.params.id, customer: req.user._id });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.status !== 'pending') {
    throw ApiError.badRequest('The cafe already accepted this order. Contact the cafe or admin to cancel.');
  }
  order.cancelledBy = 'customer';
  order.cancelReason = req.body.reason ? String(req.body.reason).slice(0, 200) : 'Cancelled by customer';
  applyStatus(order, 'cancelled', { by: req.user._id, note: order.cancelReason });
  await order.save();
  publishOrderEvent(order._id, 'cancelled', { note: order.cancelReason });
  res.json({ ok: true });
}

/** POST /api/orders/:id/review – rate cafe (and driver) after delivery */
export async function reviewOrder(req, res) {
  assertObjectId(req.params.id);
  const order = await Order.findOne({ _id: req.params.id, customer: req.user._id });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.status !== 'delivered') throw ApiError.badRequest('You can rate an order after it is delivered');
  if (order.isReviewed) throw ApiError.badRequest('You already rated this order');

  const cafeRating = Number(req.body.cafeRating);
  const driverRating = req.body.driverRating ? Number(req.body.driverRating) : undefined;
  const valid = (r) => Number.isInteger(r) && r >= 1 && r <= 5;
  if (!valid(cafeRating)) throw ApiError.badRequest('Please rate the cafe from 1 to 5');
  if (driverRating !== undefined && !valid(driverRating)) throw ApiError.badRequest('Driver rating must be 1 to 5');

  const review = await Review.create({
    order: order._id,
    customer: req.user._id,
    cafe: order.cafe,
    driver: order.driver,
    cafeRating,
    driverRating: order.driver ? driverRating : undefined,
    comment: req.body.comment ? String(req.body.comment).slice(0, 500) : undefined,
  });
  order.isReviewed = true;
  await order.save();

  const cafe = await Cafe.findById(order.cafe);
  if (cafe) {
    cafe.rating = newAverage(cafe.rating, cafe.ratingCount, cafeRating);
    cafe.ratingCount += 1;
    await cafe.save();
  }
  if (order.driver && driverRating) {
    const driver = await User.findById(order.driver);
    if (driver) {
      driver.driverProfile.rating = newAverage(driver.driverProfile.rating, driver.driverProfile.ratingCount, driverRating);
      driver.driverProfile.ratingCount += 1;
      await driver.save();
    }
  }
  res.status(201).json({ review });
}
