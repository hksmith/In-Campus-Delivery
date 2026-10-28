import { Location, Order } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { pick } from '../utils/helpers.js';

const FIELDS = ['name', 'type', 'description', 'deliveryFee', 'driverGender', 'isActive', 'sortOrder'];

/** GET /api/locations – active drop-off points for checkout */
export async function listActive(req, res) {
  const locations = await Location.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
  res.json({ locations });
}

/** Admin: GET /api/admin/locations */
export async function listAll(req, res) {
  const locations = await Location.find().sort({ sortOrder: 1, name: 1 }).lean();
  res.json({ locations });
}

export async function create(req, res) {
  const location = await Location.create(pick(req.body, FIELDS));
  res.status(201).json({ location });
}

export async function update(req, res) {
  const location = await Location.findById(req.params.id);
  if (!location) throw ApiError.notFound('Location not found');
  Object.assign(location, pick(req.body, FIELDS));
  await location.save();
  res.json({ location });
}

/** Deletes if unused, otherwise just deactivates (old orders still reference it) */
export async function remove(req, res) {
  const location = await Location.findById(req.params.id);
  if (!location) throw ApiError.notFound('Location not found');
  const used = await Order.exists({ 'delivery.location': location._id });
  if (used) {
    location.isActive = false;
    await location.save();
    return res.json({ deactivated: true, location });
  }
  await location.deleteOne();
  res.json({ deleted: true });
}
