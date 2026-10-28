export const ROLES = Object.freeze({
  CUSTOMER: 'customer',
  CAFE_OWNER: 'cafe_owner',
  CAFE_STAFF: 'cafe_staff',
  DRIVER: 'driver',
  ADMIN: 'admin',
});
export const ROLE_LIST = Object.values(ROLES);

export const ORDER_STATUS = Object.freeze({
  PENDING: 'pending', // placed, waiting for the cafe
  ACCEPTED: 'accepted', // cafe accepted – visible to drivers
  PREPARING: 'preparing',
  READY: 'ready', // food is ready for pickup
  PICKED_UP: 'picked_up', // driver has the food
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected', // cafe declined
});
export const ORDER_STATUS_LIST = Object.values(ORDER_STATUS);

export const ACTIVE_STATUSES = ['pending', 'accepted', 'preparing', 'ready', 'picked_up'];
export const FINAL_STATUSES = ['delivered', 'cancelled', 'rejected'];
/** Statuses in which an order without a driver shows up in the drivers' "available" list */
export const POOL_STATUSES = ['accepted', 'preparing', 'ready'];

export const CAFE_STATUS = ['pending', 'approved', 'rejected', 'suspended'];
export const DRIVER_STATUS = ['none', 'pending', 'approved', 'rejected', 'suspended'];
export const LOCATION_TYPES = ['dorm', 'academic', 'library', 'cafeteria', 'office', 'gate', 'other'];

export const CANCELLED_BY = ['customer', 'cafe', 'driver', 'admin', 'system'];
