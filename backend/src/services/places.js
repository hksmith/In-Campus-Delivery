import { ApiError } from '../utils/ApiError.js';

/**
 * A delivery place is typed by the customer – no fixed list, no area
 * (the delivery fee comes from the CAFE's area):
 *   dorm  → { kind: 'dorm',  block: '12', room: '305', gender: 'male'|'female' }
 *   place → { kind: 'place', text: 'Library 2nd floor', details?: 'by the window' }
 * Dorms are single-gender, so a dorm delivery only goes to a driver of the same gender.
 */

const clip = (v, n) => String(v ?? '').trim().slice(0, n);

/** Validates a place from the app and returns { kind, block, room, gender, text, details } */
export function parsePlace(input) {
  const p = input || {};
  const kind = p.kind === 'dorm' ? 'dorm' : p.kind === 'place' ? 'place' : null;
  if (!kind) throw ApiError.badRequest('Choose where to deliver');

  if (kind === 'dorm') {
    const block = clip(p.block, 20);
    const room = clip(p.room, 20);
    if (!block) throw ApiError.badRequest('Enter the block number');
    if (!room) throw ApiError.badRequest('Enter the dorm (room) number');
    if (!['male', 'female'].includes(p.gender)) throw ApiError.badRequest('Is it a male or female dorm?');
    return { kind, block, room, gender: p.gender, details: clip(p.details, 120) || undefined };
  }

  const text = clip(p.text, 80);
  if (text.length < 3) throw ApiError.badRequest('Write where to deliver');
  return { kind, text, details: clip(p.details, 120) || undefined };
}

/** What the driver / cafe sees, e.g. "Block 12, Room 305" or "Library 2nd floor" */
export function placeLabel(p) {
  return p.kind === 'dorm' ? `Block ${p.block}, Room ${p.room}` : p.text;
}
