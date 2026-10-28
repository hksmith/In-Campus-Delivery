import { Order } from '../models/index.js';
import { env } from '../config/env.js';
import { applyStatus, publishOrderEvent } from '../services/orderService.js';

/** Cancel orders the cafe never answered */
async function cancelUnansweredOrders() {
  const cutoff = new Date(Date.now() - env.ORDER_ACCEPT_TIMEOUT_MINUTES * 60000);
  const stale = await Order.find({ status: 'pending', createdAt: { $lt: cutoff } }).limit(50);
  for (const order of stale) {
    try {
      const reason = `The cafe did not respond within ${env.ORDER_ACCEPT_TIMEOUT_MINUTES} minutes`;
      order.cancelledBy = 'system';
      order.cancelReason = reason;
      applyStatus(order, 'cancelled', { note: reason });
      await order.save();
      publishOrderEvent(order._id, 'cancelled', { note: reason });
    } catch (err) {
      // VersionError = the cafe accepted it at the same moment – fine, skip
      if (err.name !== 'VersionError') console.error('Auto-cancel failed:', err.message);
    }
  }
}

/** Warn admins about orders that have waited too long for a driver */
async function alertUnclaimedOrders() {
  const cutoff = new Date(Date.now() - env.UNCLAIMED_ALERT_MINUTES * 60000);
  const orders = await Order.find({
    status: { $in: ['accepted', 'preparing', 'ready'] },
    driver: null,
    acceptedAt: { $lt: cutoff },
    unclaimedAlertSent: false,
  }).limit(20);
  for (const order of orders) {
    await Order.updateOne({ _id: order._id }, { unclaimedAlertSent: true });
    publishOrderEvent(order._id, 'unclaimed_alert');
  }
}

let timer = null;

export function startJobs() {
  const run = async () => {
    try {
      await cancelUnansweredOrders();
      await alertUnclaimedOrders();
    } catch (err) {
      console.error('Order job error:', err.message);
    }
  };
  timer = setInterval(run, 30 * 1000);
  run();
}

export function stopJobs() {
  if (timer) clearInterval(timer);
}
