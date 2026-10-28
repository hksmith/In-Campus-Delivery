import mongoose from 'mongoose';
import { ApiError } from './ApiError.js';

/** Wrap async route handlers so thrown errors reach the error middleware */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Round money to 2 decimals */
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Copy only allowed keys that are present (not undefined) in the source */
export function pick(source, keys) {
  const out = {};
  for (const key of keys) {
    if (source && source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

export function assertObjectId(id, label = 'id') {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest(`Invalid ${label}`);
  return id;
}

export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parsePaging(query, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
