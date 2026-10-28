import { User } from '../models/index.js';
import { env } from '../config/env.js';

const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Finds the user for a (validated) Telegram user object, creating them on first visit.
 * People listed in ADMIN_TELEGRAM_IDS are promoted to admin automatically.
 */
export async function findOrCreateUser(tg) {
  const telegramId = Number(tg.id);
  const isAdmin = env.ADMIN_TELEGRAM_IDS.includes(telegramId);

  let user = await User.findOne({ telegramId });
  if (!user) {
    try {
      user = await User.create({
        telegramId,
        username: tg.username,
        firstName: tg.first_name,
        lastName: tg.last_name,
        photoUrl: tg.photo_url,
        languageCode: tg.language_code,
        language: tg.language_code === 'am' ? 'am' : 'en',
        role: isAdmin ? 'admin' : 'customer',
        lastSeenAt: new Date(),
      });
      return user;
    } catch (err) {
      // Two requests created the user at the same time
      if (err.code !== 11000) throw err;
      user = await User.findOne({ telegramId });
    }
  }

  let changed = false;
  const fresh = {
    username: tg.username,
    firstName: tg.first_name,
    lastName: tg.last_name,
    photoUrl: tg.photo_url,
  };
  for (const [key, value] of Object.entries(fresh)) {
    if (value !== undefined && user[key] !== value) {
      user[key] = value;
      changed = true;
    }
  }
  if (isAdmin && user.role !== 'admin') {
    user.role = 'admin';
    changed = true;
  }
  if (!user.lastSeenAt || Date.now() - user.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    user.lastSeenAt = new Date();
    changed = true;
  }
  if (changed) await user.save();
  return user;
}
