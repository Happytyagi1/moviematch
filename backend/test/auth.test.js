/**
 * Security tests for sign-in via Google Identity Platform.
 *
 * Passwords, lockout, reset emails and Google OAuth are Identity Platform's job now;
 * these tests cover our side of the contract: which tokens we accept, how the session
 * cookie is issued and revoked, and that profiles can't be hijacked.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'node:path';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { Recommender } from '../src/ml/recommender.js';
import { config } from '../src/config.js';
import { User } from '../src/models/User.js';
import { fakeFirebase } from './helpers.js';

let mongod, app, firebase;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await User.init();
  firebase = fakeFirebase();
  app = createApp({ recommender: Recommender.load(path.resolve(import.meta.dirname, '../model')), firebase });
}, 120_000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  firebase.revoked.length = 0;
  firebase.deleted.length = 0;
});

const sessionCookie = (res) => res.headers['set-cookie']?.find((c) => c.startsWith(`${config.session.cookie}=`));

async function signIn(tokenOpts = {}, body = {}) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/session').send({ idToken: firebase.idToken(tokenOpts), ...body });
  return { agent, res };
}

describe('public sign-in config', () => {
  it('exposes only the public web config (no secrets)', async () => {
    const res = await request(app).get('/api/auth/config');
    expect(res.status).toBe(200);
    expect(res.body.firebase).toEqual({ apiKey: expect.any(String), projectId: expect.any(String), authDomain: expect.any(String) });
    expect(JSON.stringify(res.body)).not.toMatch(/private|secret|credential/i);
  });

  it('allows the Google sign-in popup and Identity Platform in the security headers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin-allow-popups');
    expect(res.headers['content-security-policy']).toMatch(/connect-src[^;]*identitytoolkit\.googleapis\.com/);
  });
});

describe('exchanging an ID token for a session', () => {
  it('"Remember me" sets a persistent cookie; otherwise a browser-session cookie', async () => {
    const remembered = sessionCookie((await signIn({}, { remember: true })).res);
    expect(remembered).toMatch(/HttpOnly/i);
    expect(remembered).toMatch(/SameSite=Strict/i);
    expect(remembered).toMatch(/Max-Age=1209600/); // 14 days
    const browserOnly = sessionCookie((await signIn({ uid: 'uid-2', email: 'b@example.com' })).res);
    expect(browserOnly).not.toMatch(/Max-Age|Expires/i);
  });

  it.each([
    ['garbage', () => 'not-a-real-token-but-long-enough'],
    ['a forged signature', () => `${firebase.idToken().slice(0, -4)}AAAA`],
    ['an expired token', () => firebase.idToken({ expired: true })],
    ['a session cookie passed as an ID token', () => firebase.expiredSession()],
  ])('rejects %s', async (_label, make) => {
    const res = await request(app).post('/api/auth/session').send({ idToken: make() });
    expect(res.status).toBe(401);
    expect(sessionCookie(res)).toBeUndefined();
  });

  it('rejects ID tokens from an old sign-in (a stolen token can’t start a new session)', async () => {
    const { res } = await signIn({ authAgeSec: config.session.maxAuthAgeSec + 60 });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('STALE_SIGN_IN');
  });

  it('validates the request body', async () => {
    expect((await request(app).post('/api/auth/session').send({})).status).toBe(400);
    expect((await request(app).post('/api/auth/session').send({ idToken: firebase.idToken(), remember: 'yes' })).status).toBe(400);
  });

  it('only accepts Google and Apple sign-ins (email/password or anonymous Identity Platform sign-ins are refused)', async () => {
    for (const provider of ['password', 'anonymous', 'phone']) {
      const { res } = await signIn({ uid: `uid-${provider}`, email: `${provider}@example.com`, provider });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PROVIDER_NOT_ALLOWED');
      expect(sessionCookie(res)).toBeUndefined();
    }
    expect(await User.countDocuments()).toBe(0);
  });

  it('uses the Google profile (name, photo) and records the provider', async () => {
    const { res } = await signIn({ name: 'Ada Lovelace', picture: 'https://lh3.googleusercontent.com/a' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Ada Lovelace', signInMethods: { password: false, google: true } });
    expect(res.body.user.avatarUrl).toMatch(/googleusercontent/);
  });

  it('accepts Apple sign-ins, using the name the browser passes (Apple tokens carry none)', async () => {
    const idToken = firebase.idToken({ uid: 'uid-apple', email: 'x1y2@privaterelay.appleid.com', name: '', provider: 'apple.com' });
    const res = await request(app).post('/api/auth/session').send({ idToken, name: 'Grace Hopper' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Grace Hopper', signInMethods: { google: false, apple: true } });
  });

  it('never attaches a different identity to an existing profile via an unverified email', async () => {
    await signIn({ uid: 'uid-ada', email: 'ada@example.com' });
    const { res } = await signIn({ uid: 'uid-attacker', email: 'ADA@example.com', emailVerified: false });
    expect(res.status).toBe(409);
    expect((await User.findOne({ email: 'ada@example.com' })).firebaseUid).toBe('uid-ada');
  });

  it('a verified email (e.g. Google) can claim the matching profile', async () => {
    await signIn({ uid: 'uid-old', email: 'ada@example.com' });
    const { res } = await signIn({ uid: 'uid-new', email: 'ada@example.com', provider: 'google.com', emailVerified: true });
    expect(res.status).toBe(200);
    expect(await User.countDocuments()).toBe(1);
  });
});

describe('using the session', () => {
  it('protects private routes and rejects forged or expired cookies', async () => {
    expect((await request(app).get('/api/recommendations')).status).toBe(401);
    const forged = await request(app).get('/api/auth/me').set('Cookie', `${config.session.cookie}=session.e30.forged`);
    expect(forged.status).toBe(401);
    await signIn();
    const expired = await request(app).get('/api/auth/me').set('Cookie', `${config.session.cookie}=${firebase.expiredSession()}`);
    expect(expired.status).toBe(401);
    expect(expired.body.code).toBe('SESSION_EXPIRED');
  });

  it('logout clears the cookie', async () => {
    const { agent } = await signIn();
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    const out = await agent.post('/api/auth/logout').expect(204);
    expect(sessionCookie(out)).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('"sign out of all devices" rejects every existing session and revokes Identity Platform tokens', async () => {
    const laptop = (await signIn()).agent;
    const phone = (await signIn()).agent;
    await new Promise((r) => setTimeout(r, 1100)); // sessions must predate the revocation by at least a second (auth_time is in seconds)
    await laptop.post('/api/auth/logout-all').expect(204);
    const res = await phone.get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_REVOKED');
    expect(firebase.revoked).toEqual(['uid-ada']);
    await new Promise((r) => setTimeout(r, 1100));
    const fresh = (await signIn()).agent; // signing in again works
    expect((await fresh.get('/api/auth/me')).status).toBe(200);
  });

  it('a password reset in Identity Platform ends existing sessions', async () => {
    const { agent } = await signIn();
    await new Promise((r) => setTimeout(r, 1100));
    firebase.validAfter.set('uid-ada', Date.now()); // what Identity Platform records on reset
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_REVOKED');
    firebase.validAfter.clear();
  });

  it('blocks cross-site POSTs (CSRF)', async () => {
    const res = await request(app).post('/api/auth/session').set('Origin', 'https://evil.example').send({ idToken: firebase.idToken() });
    expect(res.status).toBe(403);
    const site = await request(app).post('/api/auth/logout').set('Sec-Fetch-Site', 'cross-site');
    expect(site.status).toBe(403);
  });

  it('marks API responses as non-cacheable', async () => {
    const { agent } = await signIn();
    expect((await agent.get('/api/auth/me')).headers['cache-control']).toBe('no-store');
  });
});
