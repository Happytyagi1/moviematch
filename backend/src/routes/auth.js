/**
 * Sign-in is Google-only (config.firebase.allowedProviders), through Google Identity Platform
 * (Firebase Authentication). MovieMatch never handles passwords; Google does the sign-in,
 * account security and recovery.
 *
 * This router only:
 *   1. tells the browser how to reach Identity Platform           GET  /config
 *   2. swaps a fresh ID token for an HttpOnly session cookie       POST /session
 *   3. manages that session and the MovieMatch profile             GET /me, POST /logout, POST /logout-all, DELETE /me
 *
 * The session cookie is the only credential the rest of the API sees.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { User } from '../models/User.js';
import { Interaction } from '../models/Interaction.js';
import { HttpError, requireAuth, validate } from '../middleware/index.js';

const sessionSchema = z.object({
  idToken: z.string().min(20).max(4096),
  remember: z.boolean().default(false),
  name: z.string().trim().min(1).max(60).optional(), // Apple shares the name only once, outside the token
});

const sessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 10_000 : 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again in a few minutes' },
});

const cookieOptions = (maxAge) => ({
  httpOnly: true, // never readable by JavaScript, so an XSS bug can't steal it
  secure: config.isProd,
  sameSite: 'strict',
  path: '/',
  ...(maxAge ? { maxAge } : {}), // no maxAge = browser-session cookie
});
const clearSession = (res) => res.clearCookie(config.session.cookie, cookieOptions());

export function authRoutes() {
  const r = Router();

  /** Public web config for the Firebase JS SDK (identifies the project; not secret). */
  r.get('/config', (_req, res) => {
    const { projectId, apiKey, authDomain, emulatorHost, allowedProviders } = config.firebase;
    res.json({
      firebase: { apiKey, projectId, authDomain: authDomain || `${projectId}.firebaseapp.com` },
      emulatorUrl: emulatorHost ? `http://${emulatorHost}` : null,
      providers: allowedProviders,
    });
  });

  /** Exchange a fresh Identity Platform ID token for our session cookie. */
  r.post('/session', sessionLimiter, validate(sessionSchema), async (req, res) => {
    const firebase = req.app.locals.firebase;
    const { idToken, remember } = req.body;

    let decoded;
    try {
      decoded = await firebase.verifyIdToken(idToken);
    } catch {
      throw new HttpError(401, 'Sign-in failed — please try again', undefined, 'BAD_ID_TOKEN');
    }
    // Only accept a token from a sign-in that just happened (stolen old tokens are useless).
    if (!decoded.auth_time || Date.now() / 1000 - decoded.auth_time > config.session.maxAuthAgeSec) {
      throw new HttpError(401, 'Please sign in again', undefined, 'STALE_SIGN_IN');
    }
    // Enforced here too, not just by hiding the form: an email/password (or anonymous) sign-in
    // made directly against Identity Platform must not get a MovieMatch session.
    const provider = decoded.firebase?.sign_in_provider;
    if (!config.firebase.allowedProviders.includes(provider)) {
      throw new HttpError(403, 'Please sign in with Google', undefined, 'PROVIDER_NOT_ALLOWED');
    }
    if (!decoded.email) throw new HttpError(400, 'Your account has no email address', undefined, 'NO_EMAIL');

    let user = await User.findOne({ firebaseUid: decoded.uid });
    if (!user) {
      // Identity Platform keeps one account per email, so an existing profile with this email
      // can only belong to the same person if their email is verified (Google and Apple both verify it).
      const existing = await User.findOne({ email: decoded.email.toLowerCase() });
      if (existing && !decoded.email_verified) throw new HttpError(409, 'An account with this email already exists');
      user = existing || new User({ email: decoded.email.toLowerCase() });
      user.firebaseUid = decoded.uid;
      // Apple's ID token carries no name, so the browser passes the one Apple shares on first sign-in.
      user.name ||= (decoded.name || req.body.name || decoded.email.split('@')[0]).slice(0, 60);
    }
    if (provider && !user.providers.includes(provider)) user.providers.push(provider);
    if (decoded.picture) user.avatarUrl ||= decoded.picture;
    const created = user.isNew;
    await user.save();

    const expiresIn = remember ? config.session.rememberMs : config.session.browserSessionMs;
    const cookie = await firebase.createSessionCookie(idToken, expiresIn);
    res.cookie(config.session.cookie, cookie, cookieOptions(remember ? expiresIn : undefined));
    res.status(created ? 201 : 200).json({ user: user.toPublic() });
  });

  r.get('/me', requireAuth, async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) throw new HttpError(401, 'Please sign in', undefined, 'UNAUTHENTICATED');
    res.json({ user: user.toPublic() });
  });

  r.post('/logout', (_req, res) => {
    clearSession(res);
    res.status(204).end();
  });

  r.post('/logout-all', requireAuth, async (req, res) => {
    // Whole seconds, matching auth_time's precision, so signing straight back in works.
    await User.updateOne({ _id: req.userId }, { $set: { sessionsValidAfter: new Date(Math.floor(Date.now() / 1000) * 1000) } });
    await req.app.locals.firebase.revokeRefreshTokens(req.firebaseUid).catch(() => {});
    clearSession(res);
    res.status(204).end();
  });

  r.delete('/me', requireAuth, async (req, res) => {
    await Promise.all([User.deleteOne({ _id: req.userId }), Interaction.deleteMany({ user: req.userId })]);
    // Also delete the identity, so the email can't sign straight back into an empty profile.
    await req.app.locals.firebase.deleteUser(req.firebaseUid).catch((e) => console.warn('[firebase] deleteUser:', e.message));
    clearSession(res);
    res.status(204).end();
  });

  return r;
}
