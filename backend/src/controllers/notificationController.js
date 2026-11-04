import { Cafe, Order, User, WalletTransaction } from '../models/index.js';
import { ACTIVE_STATUSES } from '../config/constants.js';
import { poolFilterFor } from '../services/orderService.js';

const DRIVER_ACTIVE = ['accepted', 'preparing', 'ready', 'picked_up'];

/**
 * GET /api/notifications/counts
 * The numbers shown on the bottom tabs and inner tabs – only what this user's role needs.
 */
export async function counts(req, res) {
  const user = req.user;
  const jobs = {
    // Everyone can order food: their orders that are still on the way
    myOrders: Order.countDocuments({ customer: user._id, status: { $in: ACTIVE_STATUSES } }),
  };

  if (user.role === 'admin') {
    Object.assign(jobs, {
      pendingCafes: Cafe.countDocuments({ status: 'pending' }),
      pendingDrivers: User.countDocuments({ 'driverProfile.status': 'pending' }),
      pendingTopUps: WalletTransaction.countDocuments({ type: 'topup', status: 'pending' }),
      openIssues: Order.countDocuments({ 'pickupIssue.reported': true, 'pickupIssue.resolved': false }),
    });
  }

  if (user.role === 'driver' && user.driverProfile?.status === 'approved') {
    Object.assign(jobs, {
      available: Order.countDocuments(poolFilterFor(user)),
      myTrips: Order.countDocuments({ driver: user._id, status: { $in: DRIVER_ACTIVE } }),
    });
  }

  if (['cafe_owner', 'cafe_staff'].includes(user.role) && user.cafe) {
    Object.assign(jobs, {
      cafeNew: Order.countDocuments({ cafe: user.cafe, status: 'pending' }),
      cafeKitchen: Order.countDocuments({ cafe: user.cafe, status: { $in: ['accepted', 'preparing', 'ready'] } }),
      cafeOut: Order.countDocuments({ cafe: user.cafe, status: 'picked_up' }),
    });
  }

  const keys = Object.keys(jobs);
  const values = await Promise.all(Object.values(jobs));
  res.json({ counts: Object.fromEntries(keys.map((k, i) => [k, values[i]])) });
}
