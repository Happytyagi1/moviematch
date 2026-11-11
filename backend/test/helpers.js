/**
 * A stand-in for Google Identity Platform, so tests run offline and fast.
 *
 * It mimics the parts of firebase-admin the app uses: tokens carry their claims
 * (base64url JSON) behind a prefix, and the "signature" is a secret only this fake
 * knows, so tampered or foreign tokens are rejected just like real ones.
 */
import crypto from 'node:crypto';

export function fakeFirebase() {
  const secret = crypto.randomBytes(16).toString('hex');
  const sign = (kind, claims) => {
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(`${kind}.${body}`).digest('base64url');
    return `${kind}.${body}.${sig}`;
  };
  const read = (kind, token) => {
    const [k, body, sig] = String(token).split('.');
    const expected = crypto.createHmac('sha256', secret).update(`${k}.${body}`).digest('base64url');
    if (k !== kind || !sig || sig !== expected) throw Object.assign(new Error('invalid token'), { code: `auth/argument-error` });
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (claims.exp * 1000 < Date.now()) throw Object.assign(new Error('token expired'), { code: kind === 'session' ? 'auth/session-cookie-expired' : 'auth/id-token-expired' });
    return claims;
  };

  const fb = {
    revoked: [],
    deleted: [],
    /** What the browser gets from Identity Platform after signing in. */
    idToken({ uid = 'uid-ada', email = 'ada@example.com', name = 'Ada Lovelace', provider = 'google.com', emailVerified = provider !== 'password', authAgeSec = 0, expired = false, picture } = {}) {
      const now = Math.floor(Date.now() / 1000);
      return sign('id', {
        uid, email, name, picture, email_verified: emailVerified, auth_time: now - authAgeSec,
        exp: expired ? now - 10 : now + 3600, firebase: { sign_in_provider: provider },
      });
    },
    verifyIdToken: async (t) => read('id', t),
    createSessionCookie: async (idToken, expiresIn) => {
      const claims = read('id', idToken);
      return sign('session', { ...claims, exp: Math.floor((Date.now() + expiresIn) / 1000) });
    },
    /** Simulates Identity Platform's "tokens valid after" (set by password reset/change). */
    validAfter: new Map(),
    verifySessionCookie: async (c) => {
      const claims = read('session', c);
      if (claims.auth_time * 1000 < (fb.validAfter.get(claims.uid) || 0)) throw Object.assign(new Error('revoked'), { code: 'auth/session-cookie-revoked' });
      return claims;
    },
    /** A session cookie that has already expired (to test expiry handling). */
    expiredSession: (opts) => sign('session', { ...read('id', fb.idToken(opts)), exp: Math.floor(Date.now() / 1000) - 5 }),
    revokeRefreshTokens: async (uid) => { fb.revoked.push(uid); },
    deleteUser: async (uid) => { fb.deleted.push(uid); },
  };
  return fb;
}
