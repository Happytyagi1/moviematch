import { ZodError } from 'zod';
import { config } from '../config.js';
import { User } from '../models/User.js';

export class HttpError extends Error {
  constructor(status, message, details, code) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

/**
 * Browser: the HttpOnly Firebase session cookie. API clients: a Firebase ID token in
 * `Authorization: Bearer`. Either way the token is verified against Google's keys, then
 * mapped to the MovieMatch profile (one indexed lookup), which also enforces
 * "sign out of all devices" and account deletion.
 */
export async function requireAuth(req, _res, next) {
  const firebase = req.app.locals.firebase;
  const cookie = req.cookies?.[config.session.cookie];
  const header = req.get('authorization');
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!cookie && !bearer) return next(new HttpError(401, 'Please sign in', undefined, 'UNAUTHENTICATED'));

  let decoded;
  try {
    decoded = cookie ? await firebase.verifySessionCookie(cookie) : await firebase.verifyIdToken(bearer);
  } catch (e) {
    const code = String(e?.code || '');
    if (/revoked/.test(code)) return next(new HttpError(401, 'You were signed out — please sign in again', undefined, 'SESSION_REVOKED'));
    if (/expired/.test(code)) return next(new HttpError(401, 'Your session expired — please sign in again', undefined, 'SESSION_EXPIRED'));
    return next(new HttpError(401, 'Please sign in', undefined, 'UNAUTHENTICATED'));
  }

  const user = await User.findOne({ firebaseUid: decoded.uid }).select('_id sessionsValidAfter').lean();
  if (!user) return next(new HttpError(401, 'Please sign in', undefined, 'UNAUTHENTICATED'));
  if (user.sessionsValidAfter && decoded.auth_time * 1000 < user.sessionsValidAfter.getTime()) {
    return next(new HttpError(401, 'You were signed out — please sign in again', undefined, 'SESSION_REVOKED'));
  }
  req.userId = user._id;
  req.firebaseUid = decoded.uid;
  next();
}

/**
 * For pages guests can browse too (film details, trailers, where to watch, search):
 * a valid session sets req.userId as usual; anything else just continues as a guest.
 */
export function optionalAuth(req, res, next) {
  requireAuth(req, res, (err) => {
    if (err) {
      req.userId = undefined;
      req.firebaseUid = undefined;
    }
    next();
  });
}

/**
 * CSRF defence-in-depth on top of SameSite=Strict cookies: browsers always send
 * Origin / Sec-Fetch-Site on state-changing requests, so reject anything that
 * comes from another site.
 */
export function sameOriginOnly(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  const fetchSite = req.get('sec-fetch-site');
  const allowed = new Set([`${req.protocol}://${req.get('host')}`, config.publicUrl]);
  if ((origin && !allowed.has(origin)) || fetchSite === 'cross-site') {
    return next(new HttpError(403, 'Cross-site request blocked', undefined, 'CSRF'));
  }
  next();
}

/** Validate & coerce req[part] with a zod schema. */
export const validate = (schema, part = 'body') => (req, _res, next) => {
  const parsed = schema.parse(req[part] ?? {});
  if (part === 'query') Object.defineProperty(req, 'validQuery', { value: parsed });
  else req[part] = parsed;
  next();
};

export function notFound(req, _res, next) {
  next(new HttpError(404, `Not found: ${req.method} ${req.path}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return res.status(400).json({ error: details[0]?.message || 'Invalid input', details });
  }
  if (err?.code === 11000) return res.status(409).json({ error: 'An account with this email already exists' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  const status = err.status || 500;
  if (status >= 500 && !config.isTest) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message, code: err.code, details: err.details });
}
