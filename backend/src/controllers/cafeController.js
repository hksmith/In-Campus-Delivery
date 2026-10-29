import { Area, Cafe, MenuItem, Review } from '../models/index.js';
import { defaultArea } from '../services/areas.js';
import { ApiError } from '../utils/ApiError.js';
import { pick, escapeRegex, TIME_RE } from '../utils/helpers.js';
import { notifyAdmins, escapeHtml } from '../services/telegram.js';
import { tr } from '../i18n/messages.js';
import { emitTo, rooms } from '../services/realtime.js';

const PUBLIC_CAFE_FIELDS =
  'name description logo campusSpot area openingTime closingTime isAcceptingOrders prepTimeMinutes minOrderAmount status rating ratingCount';

/** Cafe JSON with its area ({ _id, name, deliveryFee }) – cafes without one use the default area */
async function withArea(cafes) {
  const fallback = await defaultArea();
  return cafes.map((c) => {
    const json = c.toJSON();
    const area = json.area?.name ? json.area : fallback;
    json.area = area ? { _id: area._id, name: area.name, deliveryFee: area.deliveryFee } : null;
    return json;
  });
}

/** GET /api/cafes – approved cafes, open ones first */
export async function listCafes(req, res) {
  const cafes = await Cafe.find({ status: 'approved' }).select(PUBLIC_CAFE_FIELDS).populate('area', 'name deliveryFee');
  const list = (await withArea(cafes))
    .sort((a, b) => Number(b.isOpen) - Number(a.isOpen) || b.rating - a.rating || a.name.localeCompare(b.name));
  res.json({ cafes: list });
}

/** GET /api/cafes/search?q= – search cafes and dishes */
export async function search(req, res) {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ cafes: [], items: [] });
  const re = new RegExp(escapeRegex(q), 'i');

  const approved = await Cafe.find({ status: 'approved' }).select(PUBLIC_CAFE_FIELDS).populate('area', 'name deliveryFee');
  const byId = new Map((await withArea(approved)).map((c) => [String(c._id), c]));

  const items = await MenuItem.find({
    cafe: { $in: [...byId.keys()] },
    isDeleted: false,
    $or: [{ name: re }, { category: re }, { description: re }],
  })
    .limit(40)
    .lean();

  res.json({
    cafes: [...byId.values()].filter((c) => re.test(c.name) || re.test(c.description || '')),
    items: items.map((i) => ({ ...i, cafe: byId.get(String(i.cafe)) })),
  });
}

/** GET /api/cafes/:id – cafe + menu */
export async function getCafe(req, res) {
  const cafe = await Cafe.findOne({ _id: req.params.id, status: 'approved' })
    .select(PUBLIC_CAFE_FIELDS)
    .populate('area', 'name deliveryFee');
  if (!cafe) throw ApiError.notFound('Cafe not found');
  const [cafeJson] = await withArea([cafe]);
  const menu = await MenuItem.find({ cafe: cafe._id, isDeleted: false })
    .sort({ category: 1, sortOrder: 1, name: 1 })
    .lean();
  res.json({ cafe: cafeJson, menu });
}

/** GET /api/cafes/:id/reviews */
export async function getCafeReviews(req, res) {
  const reviews = await Review.find({ cafe: req.params.id })
    .sort({ createdAt: -1 })
    .limit(30)
    .populate('customer', 'firstName')
    .select('cafeRating comment reply createdAt customer')
    .lean();
  res.json({ reviews });
}

/** POST /api/cafes/apply – register a new cafe (admin must approve) */
export async function applyCafe(req, res) {
  const user = req.user;
  if (user.role !== 'customer') throw ApiError.badRequest('Only regular users can register a cafe');
  if (!user.isProfileComplete) throw ApiError.badRequest('Please complete your profile first');
  if (user.driverProfile?.status === 'pending') {
    throw ApiError.badRequest('You have a pending driver application');
  }

  const existing = await Cafe.findOne({ owner: user._id, status: { $in: ['pending', 'approved', 'suspended'] } });
  if (existing) throw ApiError.badRequest('You already registered a cafe');

  const data = pick(req.body, [
    'name',
    'description',
    'logo',
    'phone',
    'campusSpot',
    'openingTime',
    'closingTime',
    'prepTimeMinutes',
    'minOrderAmount',
  ]);
  if (!data.name || String(data.name).trim().length < 2) throw ApiError.badRequest('Cafe name is required');
  // Which area the cafe is in (Campus & around, Gubre…) – sets the delivery fee
  const area = req.body.areaId ? await Area.findOne({ _id: req.body.areaId, isActive: true }).catch(() => null) : null;
  if (!area) throw ApiError.badRequest('Choose where your cafe is (area)');
  data.area = area._id;
  for (const t of ['openingTime', 'closingTime']) {
    if (data[t] && !TIME_RE.test(data[t])) throw ApiError.badRequest(`${t} must look like 08:00`);
  }

  const cafe = await Cafe.create({ ...data, owner: user._id, status: 'pending' });

  emitTo(rooms.admins, 'admin:applications', {});
  notifyAdmins(
    (lang) => tr(lang, 'newCafeAdmin', { name: escapeHtml(cafe.name), owner: escapeHtml(user.displayName) }),
    { button: { key: 'btnReview', path: '/admin/people?tab=cafes' } }
  );

  res.status(201).json({ cafe });
}
