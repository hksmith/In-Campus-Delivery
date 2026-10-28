/**
 * Strips keys starting with "$" or containing "." from request bodies/queries
 * to block MongoDB operator injection like { "phone": { "$ne": null } }.
 */
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.')) delete value[key];
      else value[key] = clean(value[key]);
    }
  }
  return value;
}

export function sanitize(req, res, next) {
  if (req.body) clean(req.body);
  if (req.params) clean(req.params);
  if (req.query) {
    for (const key of Object.keys(req.query)) {
      const v = req.query[key];
      if (key.startsWith('$') || (v && typeof v === 'object')) delete req.query[key];
    }
  }
  next();
}
