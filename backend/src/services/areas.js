import { Area } from '../models/index.js';

/**
 * Delivery fees come from AREAS (admin-set):
 *   - every cafe is in one area (it picks it when registering, the admin can move it)
 *   - the delivery fee of an order = the price of the cafe's area
 */

const DEFAULT_AREAS = [
  { name: 'Campus & around', deliveryFee: 15, sortOrder: 1, description: 'Cafes on campus and right around it' },
  { name: 'Gubre', deliveryFee: 30, sortOrder: 2, description: 'Cafes in Gubre town' },
];

/** On first start, create the two standard areas so the app works right away */
export async function ensureDefaultAreas() {
  if (await Area.exists({})) return;
  await Area.insertMany(DEFAULT_AREAS);
  console.log('📍 Created default delivery areas: Campus & around, Gubre (change fees in Admin → More → Areas)');
}

/** The first active area – used for cafes/places that don't have an area yet (old data) */
export async function defaultArea() {
  return Area.findOne({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
}

/** Returns the area document for an id (or the default area if missing/inactive) */
export async function resolveArea(areaId, fallback) {
  if (areaId) {
    const a = await Area.findOne({ _id: areaId, isActive: true }).lean();
    if (a) return a;
  }
  return fallback === undefined ? defaultArea() : fallback;
}
