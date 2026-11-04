import { Order, User } from '../models/index.js';
import { env } from '../config/env.js';
import { POOL_STATUSES } from '../config/constants.js';
import { emitTo, rooms } from './realtime.js';
import { sendTo, sendMany, escapeHtml, money, notifyAdmins } from './telegram.js';
import { tr, reasonLine } from '../i18n/messages.js';

const STATUS_TIMESTAMP = {
  accepted: 'acceptedAt',
  preparing: 'preparingAt',
  ready: 'readyAt',
  picked_up: 'pickedUpAt',
  delivered: 'deliveredAt',
  cancelled: 'cancelledAt',
  rejected: 'cancelledAt',
};

/** Changes the status on a loaded order document and records history (caller saves) */
export function applyStatus(order, status, { by = null, note } = {}) {
  order.status = status;
  order.statusHistory.push({ status, at: new Date(), by, note });
  const field = STATUS_TIMESTAMP[status];
  if (field) order[field] = new Date();
}

/** Standard populate for order responses */
export function populateOrder(query) {
  return query
    .populate('cafe', 'name logo phone campusSpot')
    .populate('customer', 'fullName firstName username phone telegramId')
    .populate('driver', 'fullName firstName username phone telegramId driverProfile.rating driverProfile.ratingCount');
}

/** Removes data a given audience must not see */
export function viewFor(order, audience) {
  const o = typeof order.toObject === 'function' ? order.toObject({ virtuals: true }) : { ...order };
  delete o.deliveryCodeAttempts;
  delete o.__v;
  if (audience !== 'customer') delete o.deliveryCode;
  if (audience === 'customer') {
    delete o.commission;
    delete o.platformEarning;
    delete o.driverEarning;
    delete o.cafePayout;
    delete o.pickupIssue;
  }
  if (audience === 'cafe') {
    delete o.driverEarning;
    delete o.platformEarning;
  }
  if (audience === 'driver-pool') {
    // Before claiming, drivers see where to go but not the customer's personal details
    if (o.customer) o.customer = { firstName: o.customer.firstName };
    if (o.delivery) delete o.delivery.phone;
  }
  return o;
}

const itemsSummary = (order) =>
  order.items
    .map((i) => {
      const opts = i.options?.length ? ` (${i.options.map((o) => escapeHtml(o.name)).join(', ')})` : '';
      return `• ${i.quantity}× ${escapeHtml(i.name)}${opts}`;
    })
    .join('\n');

const RECIPIENT_FIELDS = 'telegramId botBlocked language';

async function cafeTeam(cafeId) {
  return User.find({ cafe: cafeId, role: { $in: ['cafe_owner', 'cafe_staff'] } })
    .select(RECIPIENT_FIELDS)
    .lean();
}

/** Approved drivers who are allowed to deliver this order, online or offline */
function driversFor(order, isOnline) {
  return User.find({
    role: 'driver',
    'driverProfile.status': 'approved',
    'driverProfile.isOnline': isOnline,
    isBanned: false,
    ...(['female', 'male'].includes(order.delivery?.driverGender) ? { gender: order.delivery.driverGender } : {}),
  });
}

/** Online, approved drivers who are allowed to deliver this order */
async function onlineDrivers(order) {
  return driversFor(order, true).select(RECIPIENT_FIELDS).lean();
}

/** Where an order goes, as one line of text (already HTML-escaped) */
export function placeText(order) {
  return escapeHtml(
    [order.delivery?.locationName, order.delivery?.details, order.delivery?.location ? null : order.delivery?.areaName]
      .filter(Boolean)
      .join(', ')
  );
}

/** Mongo filter: orders waiting for a driver that this driver may take (respects single-gender drop-offs) */
export function poolFilterFor(driver) {
  return {
    status: { $in: POOL_STATUSES },
    driver: null,
    'delivery.driverGender': {
      $in: ['any', null, ...(['female', 'male'].includes(driver.gender) ? [driver.gender] : [])],
    },
  };
}

/**
 * Offline drivers don't get every delivery – just a reminder that they are missing out,
 * at most once every OFFLINE_NUDGE_MINUTES so they are not spammed.
 */
async function nudgeOfflineDrivers(order) {
  const since = new Date(Date.now() - env.OFFLINE_NUDGE_MINUTES * 60000);
  const drivers = await driversFor(order, false)
    .or([{ 'driverProfile.lastNudgedAt': null }, { 'driverProfile.lastNudgedAt': { $lt: since } }])
    .select(`${RECIPIENT_FIELDS} gender`)
    .lean();
  for (const d of drivers) {
    if (!d.telegramId || d.botBlocked) continue;
    const count = await Order.countDocuments(poolFilterFor(d));
    if (!count) continue;
    await User.updateOne({ _id: d._id }, { 'driverProfile.lastNudgedAt': new Date() });
    await sendTo(d, (lang) => tr(lang, count === 1 ? 'offlineNudgeOne' : 'offlineNudge', { count }), {
      button: { key: 'btnGoOnline', path: '/driver' },
    });
  }
}

async function sendTelegramForEvent(order, event, { note, previousDriverId } = {}) {
  const v = {
    n: `#${order.orderNumber}`,
    cafe: escapeHtml(order.cafe?.name),
    place: placeText(order),
    driver: escapeHtml(order.driver?.fullName || order.driver?.firstName || ''),
    payout: money(order.cafePayout),
  };
  const customer = order.customer;
  const driver = order.driver;
  const reason = (lang) => reasonLine(lang, note, escapeHtml);
  const orderBtn = { key: 'btnViewOrder', path: `/orders/${order._id}` };

  switch (event) {
    case 'created':
      await sendMany(
        await cafeTeam(order.cafe._id),
        (lang) =>
          tr(lang, 'newOrder', {
            ...v,
            items: itemsSummary(order),
            subtotal: money(order.subtotal),
            note: order.note ? tr(lang, 'orderNote', { note: escapeHtml(order.note) }) : '',
            mins: env.ORDER_ACCEPT_TIMEOUT_MINUTES,
          }),
        { button: { key: 'btnOpenOrders', path: '/cafe/orders' } }
      );
      break;
    case 'accepted': {
      const mins = order.estimatedReadyAt
        ? Math.max(1, Math.round((new Date(order.estimatedReadyAt) - Date.now()) / 60000))
        : null;
      await sendTo(customer, (lang) => tr(lang, 'accepted', v) + (mins ? tr(lang, 'acceptedEta', { mins }) : ''), {
        button: orderBtn,
      });
      if (!driver) {
        await sendMany(await onlineDrivers(order), (lang) => tr(lang, 'newDelivery', { ...v, earn: money(order.driverEarning) }), {
          button: { key: 'btnSeeDeliveries', path: '/driver' },
        });
        await nudgeOfflineDrivers(order);
      }
      break;
    }
    case 'rejected':
      await sendTo(customer, (lang) => tr(lang, 'rejected', { ...v, reason: reason(lang) }), {
        button: { key: 'btnOrderAgain', path: '/' },
      });
      break;
    case 'ready':
      await sendTo(customer, (lang) => tr(lang, driver ? 'readyWithDriver' : 'readyNoDriver', v));
      if (driver) {
        await sendTo(driver, (lang) => tr(lang, 'readyDriver', v), { button: { key: 'btnDeliveries', path: '/driver/active' } });
      }
      break;
    case 'claimed':
    case 'assigned':
      await sendTo(customer, (lang) => tr(lang, 'claimed', v), { button: orderBtn });
      if (event === 'assigned' && driver) {
        await sendTo(driver, (lang) => tr(lang, 'assigned', v), { button: { key: 'btnDeliveries', path: '/driver/active' } });
      }
      break;
    case 'picked_up':
      await sendTo(customer, (lang) => tr(lang, 'pickedUp', { ...v, code: order.deliveryCode, total: money(order.total) }), {
        button: orderBtn,
      });
      break;
    case 'delivered':
      await sendTo(customer, (lang) => tr(lang, 'delivered', v), {
        button: { key: 'btnRate', path: `/orders/${order._id}` },
      });
      break;
    case 'cancelled': {
      const by = order.cancelledBy;
      if (by !== 'customer') {
        await sendTo(customer, (lang) => tr(lang, 'cancelledCustomer', { ...v, reason: reason(lang) }), {
          button: { key: 'btnOrderAgain', path: '/' },
        });
      }
      if (by !== 'cafe') {
        await sendMany(await cafeTeam(order.cafe._id), (lang) =>
          tr(lang, 'cancelledCafe', { ...v, by: tr(lang, `by_${by}`), reason: reason(lang) })
        );
      }
      if (driver && by !== 'driver') {
        await sendTo(driver, (lang) => tr(lang, 'cancelledDriver', { ...v, reason: reason(lang) }));
      }
      break;
    }
    case 'released':
      if (previousDriverId) {
        const prev = await User.findById(previousDriverId).select(RECIPIENT_FIELDS).lean();
        await sendTo(prev, (lang) => tr(lang, 'released', v));
      }
      break;
    case 'unclaimed_alert':
      await notifyAdmins((lang) => tr(lang, 'unclaimed', { ...v, mins: env.UNCLAIMED_ALERT_MINUTES }), {
        button: { key: 'btnAdmin', path: '/admin/orders' },
      });
      break;
    case 'pickup_issue':
      await notifyAdmins(
        (lang) =>
          tr(lang, 'pickupIssue', {
            ...v,
            note: order.pickupIssue?.note ? `\n“${escapeHtml(order.pickupIssue.note)}”` : '',
          }),
        { button: { key: 'btnAdmin', path: '/admin/orders?issues=1' } }
      );
      break;
    default:
      break;
  }
}

/**
 * Broadcasts an order change to everyone who needs to know:
 * realtime (Socket.io) to open apps + Telegram messages in each person's language.
 */
export async function publishOrderEvent(orderId, event, extra = {}) {
  try {
    const order = await Order.findById(orderId)
      .select('+deliveryCode')
      .populate('cafe', 'name')
      .populate('customer', `${RECIPIENT_FIELDS} fullName`)
      .populate('driver', `${RECIPIENT_FIELDS} fullName firstName`)
      .lean();
    if (!order) return;

    const payload = {
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      status: order.status,
      event,
    };
    emitTo(rooms.user(order.customer._id), 'order:updated', payload);
    // Only the student who placed it: used for the "your order is on the way" banner
    emitTo(rooms.user(order.customer._id), 'myorder:updated', {
      ...payload,
      cafeName: order.cafe?.name,
      cancelledBy: order.cancelledBy,
    });
    emitTo(rooms.cafe(order.cafe._id), 'order:updated', payload);
    if (order.driver) emitTo(rooms.user(order.driver._id), 'order:updated', payload);
    if (extra.previousDriverId) emitTo(rooms.user(extra.previousDriverId), 'order:updated', payload);
    emitTo(rooms.admins, 'order:updated', payload);
    emitTo(rooms.drivers, 'pool:changed', payload);
    // Extra details for the in-app "new order / new delivery" banners
    const banner = {
      ...payload,
      cafeName: order.cafe?.name,
      place: [order.delivery?.locationName, order.delivery?.details].filter(Boolean).join(', ') || order.delivery?.areaName,
    };
    if (event === 'created') {
      emitTo(rooms.cafe(order.cafe._id), 'order:new', {
        ...banner,
        itemCount: order.items?.reduce((n, i) => n + (i.quantity || 1), 0),
        subtotal: order.subtotal,
      });
    }
    if (event === 'accepted' && !order.driver) {
      emitTo(rooms.drivers, 'pool:new', {
        ...banner,
        earn: order.driverEarning,
        driverGender: order.delivery?.driverGender || 'any',
      });
    }

    await sendTelegramForEvent(order, event, extra);
  } catch (err) {
    console.error(`publishOrderEvent(${event}) failed:`, err);
  }
}

/** Running average helper for ratings */
export const newAverage = (avg, count, value) => Math.round(((avg * count + value) / (count + 1)) * 100) / 100;
