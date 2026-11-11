/**
 * Optional TMDB enrichment (posters, overview, runtime).
 * Without TMDB_API_KEY the API still works — the UI renders designed
 * gradient cards instead of posters.
 *
 * Caching: in-process LRU-ish Map  →  MongoDB `moviemetas`  →  TMDB API.
 */
import { config } from '../config.js';
import { MovieMeta } from '../models/MovieMeta.js';

const IMG = 'https://image.tmdb.org/t/p';
const memory = new Map();
const MAX_MEMORY = 5000;
const inflight = new Map();

function remember(id, value) {
  if (memory.size >= MAX_MEMORY) memory.delete(memory.keys().next().value);
  memory.set(id, value);
}

function shape(doc) {
  if (!doc) return {};
  return {
    poster: doc.posterPath ? `${IMG}/w342${doc.posterPath}` : null,
    posterLarge: doc.posterPath ? `${IMG}/w500${doc.posterPath}` : null,
    backdrop: doc.backdropPath ? `${IMG}/w1280${doc.backdropPath}` : null,
    overview: doc.overview || null,
    runtime: doc.runtime || null,
  };
}

/** GET a TMDB v3 path. Accepts either credential: a v3 "API Key" (query param) or a v4 "API Read Access Token" (a JWT, sent as Bearer). */
async function tmdbGet(path) {
  const key = config.tmdbApiKey;
  const isToken = key.startsWith('eyJ');
  const url = `https://api.themoviedb.org/3${path}${isToken ? '' : `?api_key=${encodeURIComponent(key)}`}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: isToken ? { Authorization: `Bearer ${key}` } : {} });
  return res.ok ? res.json() : null;
}

async function fetchFromTmdb(movie) {
  const j = await tmdbGet(`/movie/${movie.tmdbId}`);
  if (!j) return { _id: movie.id, detailsFetched: true }; // cache misses too, so we don't hammer TMDB
  return { _id: movie.id, detailsFetched: true, posterPath: j.poster_path, backdropPath: j.backdrop_path, overview: j.overview, runtime: j.runtime };
}

async function loadOne(movie) {
  if (memory.has(movie.id)) return memory.get(movie.id);
  if (inflight.has(movie.id)) return inflight.get(movie.id);
  const p = (async () => {
    try {
      let doc = await MovieMeta.findById(movie.id).lean();
      // A record may exist with only trailer fields; details count as cached once fetched
      // (records from before this flag existed are recognised by their posterPath).
      const haveDetails = doc && (doc.detailsFetched || doc.posterPath !== undefined);
      if (!haveDetails && config.tmdbApiKey && movie.tmdbId) {
        doc = await fetchFromTmdb(movie);
        await MovieMeta.updateOne({ _id: movie.id }, { $set: doc }, { upsert: true });
      }
      const shaped = shape(doc);
      remember(movie.id, shaped);
      return shaped;
    } catch {
      return {};
    } finally {
      inflight.delete(movie.id);
    }
  })();
  inflight.set(movie.id, p);
  return p;
}

/** Attach poster info to a list of movies (bounded concurrency). */
export async function enrich(movies, { concurrency = 8 } = {}) {
  if (!config.tmdbApiKey) return movies;
  const out = new Array(movies.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, movies.length) }, async () => {
      while (next < movies.length) {
        const k = next++;
        out[k] = { ...movies[k], ...(await loadOne(movies[k])) };
      }
    }),
  );
  return out;
}

/* ---------------------------------------------------------------- trailers */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const TRAILER_RECHECK_MS = 30 * 24 * 3600 * 1000; // films without a trailer: look again after a month
const trailerMemory = new Map();
const trailerInflight = new Map();

/**
 * Pick the best video from TMDB's /videos list: YouTube only, official trailers first,
 * then teasers; English before other languages; higher resolution, then newer, as tie-breaks.
 */
export function pickTrailer(videos = []) {
  const score = (v) =>
    (v.type === 'Trailer' ? 8 : v.type === 'Teaser' ? 4 : 0) + (v.official ? 2 : 0) + (v.iso_639_1 === 'en' ? 1 : 0);
  const best = videos
    .filter((v) => v.site === 'YouTube' && YOUTUBE_ID.test(v.key || '') && ['Trailer', 'Teaser'].includes(v.type))
    .sort((a, b) => score(b) - score(a) || (b.size || 0) - (a.size || 0) || String(b.published_at || '').localeCompare(String(a.published_at || '')))[0];
  return best ? { key: best.key, name: String(best.name || 'Trailer').slice(0, 120) } : null;
}

/** The film's trailer as { key (YouTube id), name }, or null. Cached in MongoDB like posters. */
export async function trailerFor(movie) {
  if (!config.tmdbApiKey || !movie?.tmdbId) return null;
  if (trailerMemory.has(movie.id)) return trailerMemory.get(movie.id);
  if (trailerInflight.has(movie.id)) return trailerInflight.get(movie.id);
  const p = (async () => {
    try {
      const doc = await MovieMeta.findById(movie.id).select('trailerKey trailerName trailerCheckedAt').lean();
      const fresh = doc?.trailerCheckedAt && (doc.trailerKey || Date.now() - doc.trailerCheckedAt < TRAILER_RECHECK_MS);
      let trailer = fresh ? (doc.trailerKey ? { key: doc.trailerKey, name: doc.trailerName } : null) : undefined;
      if (trailer === undefined) {
        const j = await tmdbGet(`/movie/${movie.tmdbId}/videos`);
        if (!j) return null; // TMDB unavailable: don't cache, try again next time
        trailer = pickTrailer(j.results);
        await MovieMeta.updateOne(
          { _id: movie.id },
          { $set: { trailerKey: trailer?.key || null, trailerName: trailer?.name || null, trailerCheckedAt: new Date() } },
          { upsert: true },
        );
      }
      if (trailerMemory.size >= MAX_MEMORY) trailerMemory.delete(trailerMemory.keys().next().value);
      trailerMemory.set(movie.id, trailer);
      return trailer;
    } catch {
      return null;
    } finally {
      trailerInflight.delete(movie.id);
    }
  })();
  trailerInflight.set(movie.id, p);
  return p;
}

export const _test = { memory, trailerMemory };
