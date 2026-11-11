/**
 * Google Identity Platform (Firebase Authentication) on the server.
 *
 * The browser signs in with the Firebase JS SDK and hands us a short-lived ID token.
 * We verify it and exchange it for a Firebase *session cookie* (HttpOnly), so the
 * rest of the API keeps its cookie-based, JavaScript-inaccessible sessions.
 *
 * Everything the app needs is behind this small interface, so tests can pass a fake
 * (see test/helpers.js) instead of talking to Google or the emulator.
 *
 * Credentials: on Cloud Run, Application Default Credentials (the service account)
 * are used automatically. Locally, FIREBASE_AUTH_EMULATOR_HOST points at the emulator.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { config } from '../config.js';

export function createFirebase() {
  if (config.firebase.emulatorHost) process.env.FIREBASE_AUTH_EMULATOR_HOST = config.firebase.emulatorHost;
  const app = getApps()[0] || initializeApp({ projectId: config.firebase.projectId });
  const auth = getAuth(app);

  // Identity Platform bumps a user's "tokens valid after" time on password reset/change
  // and on revokeRefreshTokens. Checking it on every request would cost a Google API call,
  // so it's cached per user for a minute: a reset signs other devices out within 60 s.
  const REVOCATION_TTL_MS = 60_000;
  const validAfter = new Map(); // uid -> { t, at }
  async function tokensValidAfter(uid) {
    const hit = validAfter.get(uid);
    if (hit && Date.now() - hit.at < REVOCATION_TTL_MS) return hit.t;
    try {
      const u = await auth.getUser(uid);
      const t = u.tokensValidAfterTime ? Date.parse(u.tokensValidAfterTime) : 0;
      if (validAfter.size > 10_000) validAfter.clear();
      validAfter.set(uid, { t, at: Date.now() });
      return t;
    } catch (e) {
      if (e?.code === 'auth/user-not-found') throw Object.assign(new Error('Account no longer exists'), { code: 'auth/user-disabled' });
      console.warn('[firebase] revocation check skipped:', e?.message); // fail open on transient errors
      return 0;
    }
  }

  return {
    /** Verify a fresh ID token from the browser. Returns the decoded claims. */
    verifyIdToken: (idToken) => auth.verifyIdToken(idToken),
    /** Exchange a verified ID token for a session cookie valid for `expiresIn` ms. */
    createSessionCookie: (idToken, expiresIn) => auth.createSessionCookie(idToken, { expiresIn }),
    /** Verify a session cookie (signature checked locally) and that it wasn't revoked. */
    async verifySessionCookie(cookie) {
      const decoded = await auth.verifySessionCookie(cookie, false);
      if (decoded.auth_time * 1000 < (await tokensValidAfter(decoded.uid))) {
        throw Object.assign(new Error('Session revoked'), { code: 'auth/session-cookie-revoked' });
      }
      return decoded;
    },
    /** Invalidate every Firebase refresh token the user holds (all devices). */
    revokeRefreshTokens: async (uid) => {
      await auth.revokeRefreshTokens(uid);
      validAfter.delete(uid);
    },
    deleteUser: (uid) => auth.deleteUser(uid),
  };
}
