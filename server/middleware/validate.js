// Validates body/query/params with zod and rejects `$`-prefixed keys from the client.
const hasBadKey = (v) => {
  if (!v || typeof v !== 'object') return false;
  return Object.keys(v).some((k) => k.startsWith('$') || hasBadKey(v[k]));
};
module.exports = (schemas) => (req, res, next) => {
  for (const part of ['body', 'query', 'params']) {
    if (hasBadKey(req[part])) return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Invalid request.' });
    if (schemas[part]) {
      const r = schemas[part].safeParse(req[part]);
      if (!r.success) return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Invalid request.' });
      if (part === 'body') req.body = r.data; else req.validated = { ...(req.validated || {}), [part]: r.data };
    }
  }
  next();
};
