import mongoose from 'mongoose';
import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { translateError } from '../i18n/errors.js';

export function notFound(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || 'Something went wrong';
  let details = err.details;

  if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid ${err.path}`;
  } else if (err instanceof mongoose.Error.VersionError) {
    status = 409;
    message = 'This order was just updated by someone else. Please refresh and try again.';
  } else if (err?.code === 11000) {
    status = 409;
    message = 'This already exists';
  } else if (err instanceof multer.MulterError) {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 5 MB)' : err.message;
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    message = 'Invalid JSON body';
  }

  if (status >= 500) {
    console.error(err);
    if (env.isProd) message = 'Something went wrong. Please try again.';
  }

  // Amharic users get Amharic errors (language from their profile, or the x-lang header before login)
  const lang = req.user?.language || (req.headers['x-lang'] === 'am' ? 'am' : 'en');
  message = translateError(message, lang);

  res.status(status).json({ message, ...(details ? { details } : {}) });
}
