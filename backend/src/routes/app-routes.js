import { Router } from 'express';
import { z } from 'zod';
import { User, MOODS, ERAS, DISCOVERY, AUDIENCE } from '../models/User.js';
import { Interaction } from '../models/Interaction.js';
import { HttpError, requireAuth, validate } from '../middleware/index.js';
import { enrich, trailerFor } from '../services/tmdb.js';

/** All authenticated, recommender-backed routes. */
export function appRoutes(rec) {
  const r = Router();
  const genreEnum = z.enum(rec.genres);
  const movieIdList = z.array(z.number().int()).max(50).refine((ids) => ids.every((id) => rec.index.has(id)), 'Unknown movie');

  const prefsSchema = z.object({
    genres: z.array(genreEnum).min(1, 'Pick at least one genre').max(rec.genres.length),
    avoidGenres: z.array(genreEnum).max(rec.genres.length).default([]),
    favoriteMovies: movieIdList.min(3, 'Pick at least 3 movies you love'),
    moods: z.array(z.enum(MOODS)).max(MOODS.length).default([]),
    eras: z.array(z.enum(ERAS)).max(ERAS.length).default([]),
    discovery: z.enum(DISCOVERY).default('balanced'),
    audience: z.enum(AUDIENCE).default('solo'),
  });

  const recQuery = z.object({
    mood: z.enum(MOODS).optional(),
    genre: genreEnum.optional(),
    era: z.enum(ERAS).optional(),
    // "top-rated" or "hidden-gems"; one quality lens at a time.
    quality: z.enum(['top-rated', 'hidden-gems']).optional(),
    limit: z.coerce.number().int().min(1).max(60).default(20),
    offset: z.coerce.number().int().min(0).max(500).default(0),
  });

  const loadUser = async (req) => {
    const [user, interactions] = await Promise.all([
      User.findById(req.userId).lean(),
      Interaction.find({ user: req.userId }).sort({ updatedAt: 1 }).select('movieId reaction watched inWatchlist -_id').lean(),
    ]);
    if (!user) throw new HttpError(401, 'Please sign in');
    return { user, interactions };
  };

  /* ------------------------------------------------------------------ public */
  r.get('/model', (_req, res) => res.set('Cache-Control', 'public, max-age=3600').json(rec.info()));

  r.get('/onboarding/options', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=3600').json({ genres: rec.genres.filter((g) => g !== 'IMAX'), moods: MOODS, eras: ERAS, discovery: DISCOVERY, audience: AUDIENCE });
  });

  // Poster reel for the sign-in / sign-up screens. Public: well-known, well-rated
  // films only (no user data), computed once and cached.
  const SHOWCASE_SIZE = 60;
  let showcasePromise;
  r.get('/showcase', async (_req, res) => {
    showcasePromise ??= (async () => {
      // Spread across genres so the reel isn't all 90s dramas: round-robin over genre buckets.
      const buckets = ['Sci-Fi', 'Animation', 'Crime', 'Romance', 'Action', 'Comedy', 'Fantasy', 'Thriller', 'Drama', 'Adventure']
        .map((g) => rec.byPopularity.filter((i) => rec.genreSets[i].has(g) && rec.movies[i].rating >= 3.7 && rec.movies[i].year >= 1970));
      const picked = [];
      const seen = new Set();
      for (let row = 0; picked.length < SHOWCASE_SIZE + 12 && row < 60; row++) {
        for (const b of buckets) {
          const i = b[row];
          if (i !== undefined && !seen.has(i)) { seen.add(i); picked.push(rec.getMovie(rec.movies[i].id)); }
        }
      }
      const movies = (await enrich(picked)).filter((m) => m.poster).slice(0, SHOWCASE_SIZE);
      return { movies: movies.length ? movies : picked.slice(0, SHOWCASE_SIZE) };
    })().catch((e) => { showcasePromise = undefined; throw e; });
    res.set('Cache-Control', 'public, max-age=300').json(await showcasePromise);
  });

  /* ------------------------------------------------------------ authenticated */

  // Posters for the quiz's mood / era / discovery cards. Same for everyone, so compute once.
  let previewsPromise;
  r.get('/onboarding/previews', requireAuth, async (_req, res) => {
    previewsPromise ??= (async () => {
      const p = rec.previews();
      const withPosters = async (group) => Object.fromEntries(await Promise.all(Object.entries(group).map(async ([k, list]) => [k, await enrich(list)])));
      return { moods: await withPosters(p.moods), eras: await withPosters(p.eras), discovery: await withPosters(p.discovery) };
    })().catch((e) => { previewsPromise = undefined; throw e; });
    res.set('Cache-Control', 'private, max-age=3600').json(await previewsPromise);
  });

  const seedsQuery = z.object({
    genres: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(60).default(36),
    offset: z.coerce.number().int().min(0).max(600).default(0),
  });
  r.get('/onboarding/seeds', requireAuth, validate(seedsQuery, 'query'), async (req, res) => {
    const { genres: g, limit, offset } = req.validQuery;
    const genres = (g || '').split(',').filter((x) => rec.genres.includes(x));
    res.json({ movies: await enrich(rec.seeds({ genres, limit, offset })) });
  });

  r.put('/preferences', requireAuth, validate(prefsSchema), async (req, res) => {
    const user = await User.findByIdAndUpdate(req.userId, { preferences: req.body, onboarded: true }, { returnDocument: 'after', runValidators: true });
    if (!user) throw new HttpError(401, 'Please sign in');
    res.json({ user: user.toPublic() });
  });

  r.get('/recommendations', requireAuth, validate(recQuery, 'query'), async (req, res) => {
    const { user, interactions } = await loadUser(req);
    const { quality, ...q } = req.validQuery;
    const items = rec.recommend({ prefs: user.preferences, interactions, ...q, topRated: quality === 'top-rated', hiddenGems: quality === 'hidden-gems' });
    res.json({ items: await enrich(items) });
  });

  /** Home screen: several themed rows computed in one round-trip. */
  r.get('/recommendations/home', requireAuth, async (req, res) => {
    const { user, interactions } = await loadUser(req);
    const prefs = user.preferences || {};
    const top = rec.recommend({ prefs, interactions, limit: 20 });
    const shown = new Set(top.map((m) => m.id));
    const sections = [{ id: 'top', title: `Top picks for ${user.name.split(' ')[0]}`, items: top }];

    const liked = interactions.filter((i) => i.reaction === 'like').map((i) => i.movieId);
    const anchors = [...liked.reverse(), ...(prefs.favoriteMovies || [])];
    const anchor = anchors.length ? rec.getMovie(anchors[0]) : null;
    if (anchor) {
      const items = rec.recommend({ prefs, interactions, seedIds: [anchor.id], limit: 16, exclude: [...shown] });
      items.forEach((m) => shown.add(m.id));
      sections.push({ id: `because-${anchor.id}`, title: `Because you liked ${anchor.title}`, items });
    }

    const gems = rec.recommend({ prefs, interactions, hiddenGems: true, limit: 16, exclude: [...shown] });
    gems.forEach((m) => shown.add(m.id));
    if (gems.length >= 4) sections.push({ id: 'gems', title: 'Hidden gems for you', items: gems });

    for (const genre of (prefs.genres || []).slice(0, 3)) {
      const items = rec.recommend({ prefs, interactions, genre, limit: 16, exclude: [...shown] });
      items.forEach((m) => shown.add(m.id));
      if (items.length >= 4) sections.push({ id: `genre-${genre}`, title: `${genre} you'll love`, items });
    }

    // One TMDB pass for all rows (deduplicated by the cache).
    const enriched = await Promise.all(sections.map(async (s) => ({ ...s, items: await enrich(s.items) })));
    res.json({ sections: enriched });
  });

  /** Compact map of every movie the user has touched — lets the UI show correct button states everywhere. */
  r.get('/library/state', requireAuth, async (req, res) => {
    const docs = await Interaction.find({ user: req.userId }).select('movieId reaction watched inWatchlist -_id').lean();
    res.json({ state: Object.fromEntries(docs.map(({ movieId, ...s }) => [movieId, s])) });
  });

  r.get('/movies/search', requireAuth, validate(z.object({ q: z.string().trim().min(1).max(80), limit: z.coerce.number().int().min(1).max(60).default(24) }), 'query'), async (req, res) => {
    res.json({ movies: await enrich(rec.search(req.validQuery.q, req.validQuery.limit)) });
  });

  /** Just the trailer (cheap; cached per film): lets pages show a "Play trailer" button only when there is one. */
  r.get('/movies/:id/trailer', requireAuth, async (req, res) => {
    const movie = rec.getMovie(req.params.id);
    if (!movie) throw new HttpError(404, 'Movie not found');
    res.json({ trailer: await trailerFor(movie) });
  });

  r.get('/movies/:id', requireAuth, async (req, res) => {
    const movie = rec.getMovie(req.params.id);
    if (!movie) throw new HttpError(404, 'Movie not found');
    const [[enriched], similar, interaction, trailer] = await Promise.all([
      enrich([movie]),
      enrich(rec.similar(movie.id, 12)),
      Interaction.findOne({ user: req.userId, movieId: movie.id }).select('reaction watched inWatchlist -_id').lean(),
      trailerFor(movie), // { key: YouTube id, name } or null
    ]);
    res.json({ movie: enriched, similar, trailer, interaction: interaction || { reaction: null, watched: false, inWatchlist: false } });
  });

  const interactionSchema = z
    .object({ reaction: z.enum(['like', 'dislike']).nullable().optional(), inWatchlist: z.boolean().optional(), watched: z.boolean().optional() })
    .refine((o) => Object.keys(o).length > 0, 'Nothing to update');

  r.put('/interactions/:movieId', requireAuth, validate(interactionSchema), async (req, res) => {
    const movieId = Number(req.params.movieId);
    if (!rec.index.has(movieId)) throw new HttpError(404, 'Movie not found');
    const doc = await Interaction.findOneAndUpdate(
      { user: req.userId, movieId },
      { $set: req.body },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).select('movieId reaction watched inWatchlist -_id').lean();
    res.json({ interaction: doc });
  });

  r.get('/library', requireAuth, async (req, res) => {
    const docs = await Interaction.find({ user: req.userId }).sort({ updatedAt: -1 }).lean();
    const pick = (f) => docs.filter(f).map((d) => ({ ...rec.getMovie(d.movieId), interaction: { reaction: d.reaction, watched: d.watched, inWatchlist: d.inWatchlist } })).filter((m) => m.id);
    const [watchlist, liked, watched] = await Promise.all([
      enrich(pick((d) => d.inWatchlist)),
      enrich(pick((d) => d.reaction === 'like')),
      enrich(pick((d) => d.watched)),
    ]);
    res.json({ watchlist, liked, watched });
  });

  r.get('/favorites', requireAuth, async (req, res) => {
    const user = await User.findById(req.userId).lean();
    res.json({ movies: await enrich((user?.preferences?.favoriteMovies || []).map((id) => rec.getMovie(id)).filter(Boolean)) });
  });

  return r;
}
