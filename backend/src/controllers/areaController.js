import { Area, Cafe } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { assertObjectId, pick } from '../utils/helpers.js';
import { emitTo, rooms } from '../services/realtime.js';

const FIELDS = ['name', 'description', 'deliveryFee', 'isActive', 'sortOrder'];

function clean(body) {
  const data = pick(body, FIELDS);
  if (data.name !== undefined && String(data.name).trim().length < 2) throw ApiError.badRequest('Enter the area name');
  if (data.deliveryFee !== undefined) {
    const fee = Number(data.deliveryFee);
    if (!Number.isFinite(fee) || fee < 0) throw ApiError.badRequest('Enter a delivery fee of 0 or more');
    data.deliveryFee = Math.round(fee * 100) / 100;
  }
  if (data.sortOrder !== undefined) data.sortOrder = Number(data.sortOrder) || 0;
  return data;
}

/** GET /api/areas – active areas (cafe registration, checkout) */
export async function listActive(req, res) {
  const areas = await Area.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
  res.json({ areas });
}

/** Admin: GET /api/admin/areas – with how many cafes are in each */
export async function listAll(req, res) {
  const [areas, cafeCounts] = await Promise.all([
    Area.find().sort({ sortOrder: 1, name: 1 }).lean(),
    Cafe.aggregate([{ $match: { status: { $ne: 'rejected' } } }, { $group: { _id: '$area', n: { $sum: 1 } } }]),
  ]);
  const count = (list, id) => list.find((c) => String(c._id) === String(id))?.n || 0;
  res.json({
    areas: areas.map((a) => ({ ...a, cafeCount: count(cafeCounts, a._id) })),
  });
}

export async function create(req, res) {
  const data = clean(req.body);
  if (!data.name) throw ApiError.badRequest('Enter the area name');
  if (data.deliveryFee === undefined) throw ApiError.badRequest('Enter a delivery fee of 0 or more');
  const area = await Area.create(data);
  emitTo(rooms.admins, 'admin:areas', {});
  res.status(201).json({ area });
}

export async function update(req, res) {
  const area = await Area.findById(req.params.id);
  if (!area) throw ApiError.notFound('Area not found');
  const data = clean(req.body);
  if (data.isActive === false && area.isActive) {
    const others = await Area.countDocuments({ _id: { $ne: area._id }, isActive: true });
    if (!others) throw ApiError.badRequest('You need at least one active area');
  }
  Object.assign(area, data);
  await area.save();
  res.json({ area });
}

/** Deletes if nothing uses it, otherwise hides it (old orders keep its name) */
export async function remove(req, res) {
  const area = await Area.findById(req.params.id);
  if (!area) throw ApiError.notFound('Area not found');
  const others = await Area.countDocuments({ _id: { $ne: area._id }, isActive: true });
  if (!others) throw ApiError.badRequest('You need at least one active area');

  const used = await Cafe.exists({ area: area._id });
  if (used) {
    area.isActive = false;
    await area.save();
    return res.json({ deactivated: true, area });
  }
  await area.deleteOne();
  res.json({ deleted: true });
}

/** Admin: PATCH /api/admin/cafes/:id/area { areaId } – move a cafe to another area */
export async function setCafeArea(req, res) {
  const areaId = assertObjectId(req.body.areaId, 'area');
  const area = await Area.findOne({ _id: areaId, isActive: true });
  if (!area) throw ApiError.badRequest('Please choose an area');
  const cafe = await Cafe.findByIdAndUpdate(req.params.id, { area: area._id }, { new: true });
  if (!cafe) throw ApiError.notFound('Cafe not found');
  res.json({ cafe });
}
