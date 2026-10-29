import { env } from '../config/env.js';
import { Cafe, Settings } from '../models/index.js';
import { uploadsEnabled } from '../services/uploadService.js';

/** GET /api/auth/me – who am I + app config. The frontend calls this on start. */
export async function me(req, res) {
  const user = req.user;

  let cafe = null;
  if (user.cafe) {
    cafe = await Cafe.findById(user.cafe).select('name logo status isAcceptingOrders').lean();
  }
  const settings = await Settings.getSettings();

  res.json({
    user: user.toJSON(),
    cafe,
    settings: {
      isPlatformOpen: settings.isPlatformOpen,
      closedMessage: settings.closedMessage,
      announcement: settings.announcement,
      commission: { type: settings.commissionType, value: settings.commissionValue },
    },
    config: {
      appName: env.APP_NAME,
      universityName: env.UNIVERSITY_NAME,
      currency: env.CURRENCY,
      timezone: env.TIMEZONE,
      uploadsEnabled,
      acceptTimeoutMinutes: env.ORDER_ACCEPT_TIMEOUT_MINUTES,
    },
  });
}
