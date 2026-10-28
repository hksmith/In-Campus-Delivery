/** Tone + icon per order status. Labels come from i18n: status.<x> / statusShort.<x> */
export const STATUS = {
  pending: { tone: 'warn', icon: '⏳' },
  accepted: { tone: 'info', icon: '✅' },
  preparing: { tone: 'info', icon: '👨‍🍳' },
  ready: { tone: 'accent', icon: '🍽' },
  picked_up: { tone: 'accent', icon: '🛵' },
  delivered: { tone: 'ok', icon: '🎉' },
  cancelled: { tone: 'bad', icon: '🚫' },
  rejected: { tone: 'bad', icon: '❌' },
};

/** Steps shown on the customer's tracking timeline */
export const TRACK_STEPS = ['pending', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered'];

export const ACTIVE_STATUSES = ['pending', 'accepted', 'preparing', 'ready', 'picked_up'];

export const ROLES = ['customer', 'cafe_owner', 'cafe_staff', 'driver', 'admin'];

export const LOCATION_TYPES = ['dorm', 'academic', 'library', 'cafeteria', 'office', 'gate', 'other'];

export const PAYMENT_METHODS = ['telebirr', 'cbe', 'bank', 'cash', 'other'];

/** Home screen of each role's dashboard */
export const ROLE_HOME = {
  customer: '/',
  cafe_owner: '/cafe/orders',
  cafe_staff: '/cafe/orders',
  driver: '/driver',
  admin: '/admin',
};
