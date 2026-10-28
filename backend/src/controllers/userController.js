import { Cafe, Location } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { pick } from '../utils/helpers.js';
import { notifyAdmins, escapeHtml } from '../services/telegram.js';
import { tr } from '../i18n/messages.js';
import { emitTo, rooms } from '../services/realtime.js';

const PHONE_RE = /^\+?[0-9 ()-]{7,20}$/;

/** PATCH /api/users/me – update own profile */
export async function updateMe(req, res) {
  const data = pick(req.body, ['fullName', 'phone', 'studentId', 'defaultLocation', 'defaultLocationDetails', 'language']);
  if (data.language !== undefined && !['en', 'am'].includes(data.language)) delete data.language;

  if (data.fullName !== undefined && String(data.fullName).trim().length < 2) {
    throw ApiError.badRequest('Please enter your full name');
  }
  if (data.phone !== undefined && !PHONE_RE.test(String(data.phone).trim())) {
    throw ApiError.badRequest('Please enter a valid phone number');
  }
  if (data.defaultLocation) {
    const loc = await Location.findOne({ _id: data.defaultLocation, isActive: true });
    if (!loc) throw ApiError.badRequest('Unknown delivery location');
  } else if (data.defaultLocation === '' || data.defaultLocation === null) {
    data.defaultLocation = undefined;
  }

  Object.assign(req.user, data);
  await req.user.save();
  await req.user.populate('defaultLocation', 'name deliveryFee isActive');
  res.json({ user: req.user.toJSON() });
}

/** POST /api/users/me/driver-application */
export async function applyAsDriver(req, res) {
  const user = req.user;
  if (user.role !== 'customer') throw ApiError.badRequest('Only regular users can apply to become a driver');
  if (!user.isProfileComplete) throw ApiError.badRequest('Please complete your profile first');
  if (user.driverProfile?.status === 'pending') throw ApiError.badRequest('Your application is already under review');

  const idNumber = String(req.body.idNumber || '').trim();
  if (idNumber.length < 3) throw ApiError.badRequest('Please enter your student ID number');
  if (!['male', 'female'].includes(req.body.gender)) throw ApiError.badRequest('Please choose your gender');
  user.gender = req.body.gender;

  user.driverProfile.status = 'pending';
  user.driverProfile.idNumber = idNumber;
  user.driverProfile.idImage = req.body.idImage || undefined;
  user.driverProfile.appliedAt = new Date();
  user.driverProfile.rejectionReason = undefined;
  if (!user.studentId) user.studentId = idNumber;
  await user.save();

  emitTo(rooms.admins, 'admin:applications', {});
  notifyAdmins((lang) => tr(lang, 'newDriverAdmin', { name: escapeHtml(user.displayName) }), {
    button: { key: 'btnReview', path: '/admin/people?tab=drivers' },
  });

  res.json({ user: user.toJSON() });
}

/** GET /api/users/me/cafe-application – status of a cafe the user registered */
export async function myCafeApplication(req, res) {
  const cafe = await Cafe.findOne({ owner: req.user._id }).sort({ createdAt: -1 }).lean();
  res.json({ cafe });
}
