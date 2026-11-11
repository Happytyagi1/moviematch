import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'node:path';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { Recommender } from '../src/ml/recommender.js';
import { fakeFirebase } from './helpers.js';

let mongod, app, rec, firebase;
const id = (title) => rec.movies.find((m) => m.title === title).id;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  rec = Recommender.load(path.resolve(import.meta.dirname, '../model'));
  firebase = fakeFirebase();
  app = createApp({ recommender: rec, firebase });
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});

const user = { name: 'Ada Lovelace', email: 'ada@example.com' };

/** Sign in with Google through Identity Platform (faked), then exchange the ID token for our session. */
async function signUp({ name = user.name, email = user.email } = {}) {
  const agent = request.agent(app); // keeps the httpOnly cookie like a browser
  const idToken = firebase.idToken({ uid: `uid-${email}`, email, name });
  const res = await agent.post('/api/auth/session').send({ idToken });
  expect(res.status).toBe(201);
  return agent;
}

const prefs = () => ({
  genres: ['Sci-Fi', 'Thriller'],
  avoidGenres: ['Horror'],
  favoriteMovies: [id('The Matrix'), id('Inception'), id('Interstellar')],
  moods: ['mind-bending'],
  eras: ['modern'],
  discovery: 'balanced',
  audience: 'solo',
});

describe('health & public', () => {
  it('GET /api/health reports db + model', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body).toMatchObject({ status: 'ok', db: 'up', movies: rec.n });
  });

  it('GET /api/onboarding/options lists quiz choices', async () => {
    const res = await request(app).get('/api/onboarding/options');
    expect(res.body.genres).toContain('Sci-Fi');
    expect(res.body.moods).toContain('feel-good');
  });

  it('sets security headers and hides x-powered-by', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('unknown API routes return JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Not found/);
  });
});

describe('auth', () => {
  it('a first Google sign-in creates a profile and an httpOnly session cookie, with no tokens in the body', async () => {
    const res = await request(app).post('/api/auth/session').send({ idToken: firebase.idToken() });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com', onboarded: false, signInMethods: { password: false, google: true } });
    expect(res.headers['set-cookie'].join(' | ')).toMatch(/mm_session=[^;]+;.*HttpOnly.*SameSite=Strict/i);
    expect(res.body.token).toBeUndefined(); // tokens never exposed to JavaScript
  });

  it('signing in again reuses the same profile', async () => {
    await signUp();
    const again = await request(app).post('/api/auth/session').send({ idToken: firebase.idToken({ uid: 'uid-ada@example.com' }) });
    expect(again.status).toBe(200);
    expect(again.body.user.name).toBe('Ada Lovelace');
  });

  it('supports Firebase ID tokens as Bearer tokens for API clients', async () => {
    await signUp();
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${firebase.idToken({ uid: 'uid-ada@example.com' })}`);
    expect(me.body.user.email).toBe(user.email);
  });

  it('protects private routes and rejects forged tokens', async () => {
    expect((await request(app).get('/api/recommendations')).status).toBe(401);
    const forged = await request(app).get('/api/auth/me').set('Authorization', 'Bearer abc.def.ghi');
    expect(forged.status).toBe(401);
  });

  it('logout clears the session', async () => {
    const agent = await signUp();
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    await agent.post('/api/auth/logout').expect(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });
});

describe('onboarding → recommendations', () => {
  it('validates the quiz answers', async () => {
    const agent = await signUp();
    const tooFew = await agent.put('/api/preferences').send({ ...prefs(), favoriteMovies: [id('Up')] });
    expect(tooFew.status).toBe(400);
    expect(tooFew.body.error).toMatch(/at least 3/);
    const badGenre = await agent.put('/api/preferences').send({ ...prefs(), genres: ['Telenovela'] });
    expect(badGenre.status).toBe(400);
    const unknownMovie = await agent.put('/api/preferences').send({ ...prefs(), favoriteMovies: [1, 2, 99999999] });
    expect(unknownMovie.body.error).toMatch(/Unknown movie/);
  });

  it('returns seeds for the chosen genres', async () => {
    const agent = await signUp();
    const res = await agent.get('/api/onboarding/seeds?genres=Horror,Comedy');
    expect(res.body.movies.length).toBe(36);
    expect(res.body.movies.some((m) => m.genres.includes('Horror'))).toBe(true);
  });

  it('full journey: quiz → personalised home → feedback → library', async () => {
    const agent = await signUp();
    const saved = await agent.put('/api/preferences').send(prefs());
    expect(saved.status).toBe(200);
    expect(saved.body.user.onboarded).toBe(true);

    const home = await agent.get('/api/recommendations/home');
    expect(home.status).toBe(200);
    const [top, ...rest] = home.body.sections;
    expect(top.title).toBe('Top picks for Ada');
    expect(top.items).toHaveLength(20);
    expect(rest.some((s) => s.title.startsWith('Because you liked'))).toBe(true);
    const all = home.body.sections.flatMap((s) => s.items.map((m) => m.id));
    expect(new Set(all).size).toBe(all.length); // no movie repeated across rows
    expect(all.some((x) => rec.getMovie(x).genres.includes('Horror'))).toBe(false); // avoided genre
    expect(all).not.toContain(id('The Matrix')); // favourites excluded

    const target = top.items[0].id;
    await agent.put(`/api/interactions/${target}`).send({ inWatchlist: true }).expect(200);
    await agent.put(`/api/interactions/${target}`).send({ reaction: 'like' }).expect(200);
    const lib = await agent.get('/api/library');
    expect(lib.body.watchlist.map((m) => m.id)).toEqual([target]);
    expect(lib.body.liked[0].interaction).toMatchObject({ reaction: 'like', inWatchlist: true });
    const state = await agent.get('/api/library/state');
    expect(state.body.state[target]).toEqual({ reaction: 'like', inWatchlist: true, watched: false });

    // liked movie is no longer recommended
    const again = await agent.get('/api/recommendations?limit=40');
    expect(again.body.items.map((m) => m.id)).not.toContain(target);
  });

  it('supports mood + genre filters and pagination', async () => {
    const agent = await signUp();
    await agent.put('/api/preferences').send(prefs());
    const funny = await agent.get('/api/recommendations?mood=funny&limit=10');
    for (const m of funny.body.items) expect(m.genres).toContain('Comedy');
    const war = await agent.get('/api/recommendations?genre=War&limit=5&offset=5');
    expect(war.body.items.length).toBe(5);
    const bad = await agent.get('/api/recommendations?mood=sleepy');
    expect(bad.status).toBe(400);
  });

  it('supports era and rating filters', async () => {
    const agent = await signUp();
    await agent.put('/api/preferences').send(prefs());
    const r = await agent.get('/api/recommendations?era=modern&quality=top-rated&limit=10');
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBeGreaterThan(0);
    for (const m of r.body.items) expect(m.year >= 2000 && m.year <= 2009 && m.rating >= 3.7).toBe(true);
    const gems = await agent.get('/api/recommendations?quality=hidden-gems&limit=10');
    for (const m of gems.body.items) expect(m.popularity).toBeLessThanOrEqual(0.62);
    expect((await agent.get('/api/recommendations?era=future')).status).toBe(400);
    expect((await agent.get('/api/recommendations?quality=best')).status).toBe(400);
  });

  it('movie details include similar titles and interaction state', async () => {
    const agent = await signUp();
    const res = await agent.get(`/api/movies/${id('Toy Story')}`);
    expect(res.body.movie.title).toBe('Toy Story');
    expect(res.body.similar.map((m) => m.title)).toContain('Toy Story 2');
    expect(res.body.interaction).toEqual({ reaction: null, watched: false, inWatchlist: false });
    expect((await agent.get('/api/movies/123456789')).status).toBe(404);
  });

  it('search works and validates input', async () => {
    const agent = await signUp();
    const res = await agent.get('/api/movies/search?q=godfather');
    expect(res.body.movies[0].title).toMatch(/Godfather/);
    expect((await agent.get('/api/movies/search?q=')).status).toBe(400);
  });

  it('rejects interactions on unknown movies or with empty bodies', async () => {
    const agent = await signUp();
    expect((await agent.put('/api/interactions/999999999').send({ watched: true })).status).toBe(404);
    expect((await agent.put(`/api/interactions/${id('Up')}`).send({})).status).toBe(400);
  });

  it('users only see their own data, and can delete their account', async () => {
    const a = await signUp();
    const b = await signUp({ email: 'grace@example.com', name: 'Grace' });
    await a.put(`/api/interactions/${id('Up')}`).send({ inWatchlist: true });
    expect((await b.get('/api/library')).body.watchlist).toHaveLength(0);
    await a.delete('/api/auth/me').expect(204);
    expect((await a.get('/api/auth/me')).status).toBe(401);
    expect(firebase.deleted).toContain('uid-ada@example.com'); // the identity is deleted too
    expect((await b.get('/api/auth/me')).status).toBe(200);
  });
});
