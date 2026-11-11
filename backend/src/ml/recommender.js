/**
 * MovieMatch inference engine.
 *
 * Loads the hybrid embeddings trained by `ml/train.py` into a single
 * Float32Array and scores the whole catalogue (≈3.6k movies × 80 dims) per
 * request in well under a millisecond — no separate model server needed.
 *
 * score(movie) =  cos(userProfile, movie)                 ← learned taste (fold-in)
 *               + beta_user   · popularity                ← tuned offline, scaled by "mainstream ↔ hidden gems"
 *               + mood / era / audience boosts            ← onboarding answers
 * then Maximal-Marginal-Relevance re-ranking for diversity, plus a
 * human-readable reason for every pick.
 */
import fs from 'node:fs';
import path from 'node:path';

export const MOOD_GENRES = {
  'feel-good': ['Comedy', 'Animation', 'Children', 'Musical', 'Adventure'],
  thrilling: ['Action', 'Thriller', 'Adventure', 'Crime'],
  'mind-bending': ['Sci-Fi', 'Mystery', 'Thriller'],
  emotional: ['Drama', 'Romance', 'War'],
  dark: ['Horror', 'Crime', 'Film-Noir', 'Thriller'],
  romantic: ['Romance'],
  funny: ['Comedy'],
  epic: ['Adventure', 'Fantasy', 'War', 'Western', 'IMAX'],
};

const ERA_RANGES = { classic: [0, 1979], retro: [1980, 1999], modern: [2000, 2009], recent: [2010, 9999] };
// MovieLens has no age ratings, so "family" mode combines genre rules with
// user-applied tags. Heuristic — see README for the TMDB certification upgrade.
const FAMILY_BLOCK_GENRES = ['Horror', 'Crime', 'Thriller', 'Film-Noir'];
const ADULT_TAG_RE = /violen|gore|gory|nudity|sex|drugs|crude|profanit|swearing|dark comedy|disturbing|brutal|bloody|r-rated|adult/;

// Posters shown on the quiz's mood and era cards: well-known films that clearly fit each label.
const QUIZ_PREVIEWS = {
  moods: {
    'feel-good': ['Forrest Gump', 'Toy Story', 'Amelie'],
    thrilling: ['Die Hard', 'The Dark Knight', 'Mad Max: Fury Road'],
    'mind-bending': ['Inception', 'The Matrix', 'Memento'],
    emotional: ['The Shawshank Redemption', 'The Green Mile', 'Good Will Hunting'],
    dark: ['Seven', 'The Silence of the Lambs', 'Fight Club'],
    romantic: ['Titanic', 'Notting Hill', 'The Notebook'],
    funny: ['The Hangover', 'Groundhog Day', 'Monty Python and the Holy Grail'],
    epic: ['The Lord of the Rings: The Fellowship of the Ring', 'Gladiator', 'Braveheart'],
  },
  eras: {
    classic: ['Casablanca', 'The Godfather', 'Star Wars: Episode IV - A New Hope'],
    retro: ['Back to the Future', 'Pulp Fiction', 'Jurassic Park'],
    modern: ['Finding Nemo', 'Pirates of the Caribbean: The Curse of the Black Pearl', 'Slumdog Millionaire'],
    recent: ['Interstellar', 'Whiplash', 'Get Out'],
  },
};

// "Top rated" filter: well-reviewed AND enough ratings that the average means something.
const TOP_RATED = { minRating: 3.7, minCount: 20 };

const DISCOVERY_BETA = { mainstream: 1.6, balanced: 1.0, 'hidden-gems': 0.15 };

const WEIGHTS = {
  favorite: 1.0,
  like: 1.0,
  dislike: -0.6,
  genre: 0.45,
  avoidGenre: -0.35,
  mood: 0.07,
  era: 0.07,
  eraMiss: -0.05,
  family: 0.2,
  quality: 0.12,
};

export class Recommender {
  constructor({ meta, embeddings }) {
    this.meta = meta;
    this.dim = meta.dim;
    this.n = meta.count;
    this.E = embeddings;
    this.movies = meta.movies;
    this.beta = meta.params.beta;
    this.genres = meta.genres;
    this.index = new Map(this.movies.map((m, i) => [m.id, i]));
    this.genreSets = this.movies.map((m) => new Set(m.genres));
    this.searchKeys = this.movies.map((m) => normalizeText(m.title));
    this.byPopularity = [...this.movies.keys()].sort((a, b) => this.movies[b].popularity - this.movies[a].popularity);
    this.genreCentroids = this.#buildGenreCentroids();
  }

  static load(dir) {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'model.json'), 'utf8'));
    const buf = fs.readFileSync(path.join(dir, 'embeddings.bin'));
    const embeddings = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    if (embeddings.length !== meta.count * meta.dim) throw new Error('Embedding size mismatch');
    return new Recommender({ meta, embeddings });
  }

  /* ------------------------------------------------------------- vectors */
  row(i) {
    return this.E.subarray(i * this.dim, (i + 1) * this.dim);
  }

  #addScaled(target, i, w) {
    const off = i * this.dim;
    for (let d = 0; d < this.dim; d++) target[d] += w * this.E[off + d];
  }

  #buildGenreCentroids() {
    // Popularity-weighted mean of each genre's movies: a "typical Sci-Fi taste".
    const out = {};
    for (const g of this.genres) {
      const v = new Float32Array(this.dim);
      this.movies.forEach((m, i) => {
        if (this.genreSets[i].has(g)) this.#addScaled(v, i, m.popularity ** 2);
      });
      out[g] = normalize(v);
    }
    return out;
  }

  /** Fold a user's answers + feedback into one taste vector (same maths as training). */
  buildProfile(prefs = {}, interactions = []) {
    const v = new Float32Array(this.dim);
    let signal = 0;
    for (const id of prefs.favoriteMovies || []) {
      const i = this.index.get(id);
      if (i !== undefined) { this.#addScaled(v, i, WEIGHTS.favorite); signal++; }
    }
    for (const it of interactions) {
      const i = this.index.get(it.movieId);
      if (i === undefined) continue;
      if (it.reaction === 'like') { this.#addScaled(v, i, WEIGHTS.like); signal++; }
      else if (it.reaction === 'dislike') { this.#addScaled(v, i, WEIGHTS.dislike); signal++; }
    }
    for (const g of prefs.genres || []) {
      const c = this.genreCentroids[g];
      if (c) { for (let d = 0; d < this.dim; d++) v[d] += WEIGHTS.genre * c[d]; signal++; }
    }
    for (const g of prefs.avoidGenres || []) {
      const c = this.genreCentroids[g];
      if (c) for (let d = 0; d < this.dim; d++) v[d] += WEIGHTS.avoidGenre * c[d];
    }
    return signal ? normalize(v) : null;
  }

  /* ------------------------------------------------------------- ranking */
  /**
   * @param {object} opts
   * @param {object} opts.prefs         onboarding preferences
   * @param {Array}  opts.interactions  [{movieId, reaction, watched, inWatchlist}]
   * @param {string} [opts.mood]        optional mood override for this request
   * @param {string} [opts.genre]       restrict to a genre
   * @param {number} [opts.limit=20]
   * @param {number} [opts.offset=0]
   * @param {number[]} [opts.seedIds]   rank by similarity to these movies instead of the profile
   * @param {boolean} [opts.hiddenGems] prefer less-popular, high-quality titles
   * @param {string} [opts.era]         restrict to a release era (classic | retro | modern | recent)
   * @param {boolean} [opts.topRated]   only well-reviewed titles, ranked with more weight on rating
   */
  recommend({ prefs = {}, interactions = [], mood, genre, era, topRated = false, limit = 20, offset = 0, seedIds, hiddenGems = false, exclude = [] } = {}) {
    const eraRange = era ? ERA_RANGES[era] : null;
    const profile = seedIds?.length ? this.buildProfile({ favoriteMovies: seedIds }) : this.buildProfile(prefs, interactions);

    const excluded = new Set(exclude);
    for (const id of prefs.favoriteMovies || []) excluded.add(id);
    for (const it of interactions) if (it.reaction || it.watched) excluded.add(it.movieId);
    for (const id of seedIds || []) excluded.add(id);

    const avoid = new Set(prefs.avoidGenres || []);
    const family = prefs.audience === 'family';
    if (family) FAMILY_BLOCK_GENRES.forEach((g) => avoid.add(g));

    const moods = mood ? [mood] : prefs.moods || [];
    const moodGenres = new Map();
    for (const m of moods) for (const g of MOOD_GENRES[m] || []) moodGenres.set(g, (moodGenres.get(g) || 0) + 1);
    const moodStrength = mood ? 2.5 : 1; // an explicit mood filter matters more than a general leaning

    const eras = prefs.eras || [];
    const discovery = hiddenGems ? 'hidden-gems' : prefs.discovery || 'balanced';
    const beta = this.beta * (DISCOVERY_BETA[discovery] ?? 1) * (profile ? 1 : 3);
    const qualityW = WEIGHTS.quality * (topRated ? 4 : discovery === 'hidden-gems' ? 1.5 : 1);

    const scores = new Float32Array(this.n);
    const candidates = [];
    for (let i = 0; i < this.n; i++) {
      const m = this.movies[i];
      if (excluded.has(m.id)) continue;
      const gs = this.genreSets[i];
      if (genre && !gs.has(genre)) continue;
      let blocked = false;
      for (const g of avoid) if (gs.has(g)) { blocked = true; break; }
      if (blocked) continue;
      if (family && m.tags.some((t) => ADULT_TAG_RE.test(t))) continue;
      if (hiddenGems && (m.popularity > 0.62 || m.rating < 3.6)) continue;
      if (mood && ![...gs].some((g) => moodGenres.has(g))) continue;
      if (eraRange && (!m.year || m.year < eraRange[0] || m.year > eraRange[1])) continue;
      if (topRated && (m.rating < TOP_RATED.minRating || m.ratingCount < TOP_RATED.minCount)) continue;

      let s = 0;
      if (profile) {
        const off = i * this.dim;
        for (let d = 0; d < this.dim; d++) s += profile[d] * this.E[off + d];
      }
      s += beta * m.popularity;
      s += qualityW * (m.rating - 3.5);

      if (moodGenres.size) {
        let hit = 0;
        for (const g of gs) hit += moodGenres.get(g) || 0;
        s += WEIGHTS.mood * moodStrength * Math.min(hit, 2);
      }
      if (eras.length && m.year) {
        const inEra = eras.some((e) => m.year >= ERA_RANGES[e][0] && m.year <= ERA_RANGES[e][1]);
        s += inEra ? WEIGHTS.era : WEIGHTS.eraMiss;
      }
      if (family && (gs.has('Children') || gs.has('Animation'))) s += WEIGHTS.family;

      scores[i] = s;
      candidates.push(i);
    }

    // Shortlist then diversify with MMR.
    const poolSize = Math.min(candidates.length, Math.max(200, (offset + limit) * 4));
    const pool = topK(candidates, scores, poolSize);
    const ranked = this.#mmr(pool, scores, offset + limit, 0.78);

    const anchors = this.#anchors(prefs, interactions, seedIds);
    return ranked.slice(offset).map((i) => this.#present(i, scores[i], anchors, prefs, moods));
  }

  /** Maximal Marginal Relevance: trade a little relevance for variety. */
  #mmr(pool, scores, k, lambda) {
    if (pool.length <= 1) return pool;
    const selected = [];
    const maxSim = new Float32Array(pool.length).fill(-1);
    const used = new Uint8Array(pool.length);
    // scale relevance to [0,1] so lambda behaves consistently
    let lo = Infinity, hi = -Infinity;
    for (const i of pool) { lo = Math.min(lo, scores[i]); hi = Math.max(hi, scores[i]); }
    const span = hi - lo || 1;
    for (let step = 0; step < Math.min(k, pool.length); step++) {
      let best = -1, bestVal = -Infinity;
      for (let p = 0; p < pool.length; p++) {
        if (used[p]) continue;
        const rel = (scores[pool[p]] - lo) / span;
        const val = lambda * rel - (1 - lambda) * (selected.length ? Math.max(0, maxSim[p]) : 0);
        if (val > bestVal) { bestVal = val; best = p; }
      }
      used[best] = 1;
      const chosen = pool[best];
      selected.push(chosen);
      for (let p = 0; p < pool.length; p++) {
        if (!used[p]) maxSim[p] = Math.max(maxSim[p], this.#dot(pool[p], chosen));
      }
    }
    return selected;
  }

  #dot(a, b) {
    const oa = a * this.dim, ob = b * this.dim;
    let s = 0;
    for (let d = 0; d < this.dim; d++) s += this.E[oa + d] * this.E[ob + d];
    return s;
  }

  #anchors(prefs, interactions, seedIds) {
    const ids = new Set(seedIds?.length ? seedIds : prefs.favoriteMovies || []);
    if (!seedIds?.length) for (const it of interactions) if (it.reaction === 'like') ids.add(it.movieId);
    return [...ids].map((id) => this.index.get(id)).filter((i) => i !== undefined);
  }

  #present(i, score, anchors, prefs, moods) {
    const m = this.movies[i];
    let reason = null;
    let bestSim = 0.35; // only claim "because you liked X" when it's genuinely similar
    for (const a of anchors) {
      const s = this.#dot(i, a);
      if (s > bestSim) { bestSim = s; reason = { type: 'similar', text: `Because you liked ${this.movies[a].title}`, movieId: this.movies[a].id }; }
    }
    if (!reason) {
      const g = m.genres.find((x) => (prefs.genres || []).includes(x));
      const mood = moods.find((md) => (MOOD_GENRES[md] || []).some((x) => m.genres.includes(x)));
      if (mood) reason = { type: 'mood', text: `Fits your ${mood.replace('-', ' ')} mood` };
      else if (g) reason = { type: 'genre', text: `Matches your love of ${g}` };
      else if (m.popularity > 0.75) reason = { type: 'popular', text: 'A crowd favourite' };
      else reason = { type: 'discovery', text: 'A hidden gem we think you’ll enjoy' };
    }
    return { ...this.publicMovie(i), match: matchPercent(score), reason };
  }

  /* ------------------------------------------------------------- catalogue */
  publicMovie(i) {
    const m = this.movies[i];
    return {
      id: m.id, title: m.title, year: m.year, genres: m.genres, tags: m.tags,
      rating: m.rating, ratingCount: m.ratingCount, popularity: m.popularity,
      tmdbId: m.tmdbId, imdbId: m.imdbId,
    };
  }

  getMovie(id) {
    const i = this.index.get(Number(id));
    return i === undefined ? null : this.publicMovie(i);
  }

  similar(id, limit = 12) {
    const i = this.index.get(Number(id));
    if (i === undefined) return [];
    const scores = new Float32Array(this.n);
    const cands = [];
    for (let j = 0; j < this.n; j++) {
      if (j === i) continue;
      scores[j] = this.#dot(i, j) + 0.05 * this.movies[j].popularity;
      cands.push(j);
    }
    return topK(cands, scores, limit).map((j) => ({ ...this.publicMovie(j), match: matchPercent(scores[j]) }));
  }

  search(query, limit = 20) {
    const q = normalizeText(query);
    if (!q) return [];
    const hits = [];
    for (let i = 0; i < this.n; i++) {
      const key = this.searchKeys[i];
      const pos = key.indexOf(q);
      if (pos === -1) continue;
      // prefix / word-start matches first, then popularity
      const rank = (pos === 0 ? 2 : key[pos - 1] === ' ' ? 1 : 0) + this.movies[i].popularity;
      hits.push([rank, i]);
    }
    hits.sort((a, b) => b[0] - a[0]);
    return hits.slice(0, limit).map(([, i]) => this.publicMovie(i));
  }

  /** Popular, well-rated movies spread across the user's chosen genres — for the "pick favourites" quiz step. */
  seeds({ genres = [], limit = 36, offset = 0 } = {}) {
    const wanted = genres.length ? genres : ['Action', 'Comedy', 'Drama', 'Sci-Fi', 'Animation', 'Thriller', 'Romance', 'Horror'];
    const page = limit;
    limit = offset + page; // build the list up to the end of the requested page, then slice
    const perGenre = Math.ceil(limit / wanted.length) + 1;
    const out = [];
    const seen = new Set();
    const buckets = wanted.map((g) => this.byPopularity.filter((i) => this.genreSets[i].has(g) && this.movies[i].rating >= 3.5).slice(0, perGenre * 2));
    for (let r = 0; out.length < limit && r < perGenre * 2; r++) {
      for (const b of buckets) {
        const i = b[r];
        if (i !== undefined && !seen.has(i)) { seen.add(i); out.push(this.publicMovie(i)); if (out.length >= limit) break; }
      }
    }
    return out.slice(offset, offset + page);
  }

  /**
   * Three illustrative films per quiz card (moods, eras, discovery styles), so each
   * answer is shown with real posters. Moods/eras use hand-picked, widely known titles;
   * discovery styles are computed from popularity and rating.
   */
  previews() {
    const byTitle = (title) => {
      let best;
      for (let i = 0; i < this.n; i++) {
        if (this.movies[i].title === title && (best === undefined || this.movies[i].popularity > this.movies[best].popularity)) best = i;
      }
      return best;
    };
    const fromTitles = (titles) => titles.map(byTitle).filter((i) => i !== undefined).slice(0, 3).map((i) => this.publicMovie(i));
    const map = (o) => Object.fromEntries(Object.entries(o).map(([k, titles]) => [k, fromTitles(titles)]));

    const wellKnown = this.byPopularity.filter((i) => this.movies[i].rating >= 3.9);
    const gems = [...this.movies.keys()]
      .filter((i) => this.movies[i].popularity <= 0.55 && this.movies[i].ratingCount >= 15 && this.movies[i].rating >= 3.9)
      .sort((a, b) => this.movies[b].rating - this.movies[a].rating);
    const mid = this.byPopularity.filter((i) => this.movies[i].popularity <= 0.75 && this.movies[i].popularity > 0.55 && this.movies[i].rating >= 3.8);

    return {
      moods: map(QUIZ_PREVIEWS.moods),
      eras: map(QUIZ_PREVIEWS.eras),
      discovery: {
        mainstream: wellKnown.slice(0, 3).map((i) => this.publicMovie(i)),
        balanced: [wellKnown[3], mid[0], gems[3]].filter((i) => i !== undefined).map((i) => this.publicMovie(i)),
        'hidden-gems': gems.slice(0, 3).map((i) => this.publicMovie(i)),
      },
    };
  }

  info() {
    const { version, dataset, dim, count, params, evaluation } = this.meta;
    return { version, dataset, dim, count, params, evaluation: { best: evaluation.best, baselines: evaluation.baselines, split: evaluation.split, selection: evaluation.selection } };
  }
}

/* ----------------------------------------------------------------- helpers */
export function normalize(v) {
  let n = 0;
  for (let d = 0; d < v.length; d++) n += v[d] * v[d];
  n = Math.sqrt(n);
  if (n < 1e-9) return v;
  for (let d = 0; d < v.length; d++) v[d] /= n;
  return v;
}

export function topK(indices, scores, k) {
  if (indices.length <= k) return [...indices].sort((a, b) => scores[b] - scores[a]);
  // partial selection via a simple min-heap
  const heap = [];
  const push = (i) => {
    heap.push(i);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (scores[heap[p]] <= scores[heap[c]]) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const replaceTop = (i) => {
    heap[0] = i;
    let p = 0;
    for (;;) {
      const l = 2 * p + 1, r = l + 1;
      let m = p;
      if (l < heap.length && scores[heap[l]] < scores[heap[m]]) m = l;
      if (r < heap.length && scores[heap[r]] < scores[heap[m]]) m = r;
      if (m === p) break;
      [heap[p], heap[m]] = [heap[m], heap[p]];
      p = m;
    }
  };
  for (const i of indices) {
    if (heap.length < k) push(i);
    else if (scores[i] > scores[heap[0]]) replaceTop(i);
  }
  return heap.sort((a, b) => scores[b] - scores[a]);
}

function matchPercent(score) {
  // Squash the raw score (≈0.3–1.4 in practice) into a friendly 50–99% "match"
  // with enough spread that the number means something.
  return Math.round(50 + 49 / (1 + Math.exp(-4 * (score - 0.8))));
}

export function normalizeText(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let instance;
export function getRecommender(dir) {
  if (!instance) instance = Recommender.load(dir);
  return instance;
}
