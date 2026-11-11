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

async function fetchFromTmdb(movie) {
  // Accept either TMDB credential: a v3 "API Key" (query param) or a v4 "API Read Access Token" (a JWT, sent as Bearer).
  const key = config.tmdbApiKey;
  const isToken = key.startsWith('eyJ');
  const url = `https://api.themoviedb.org/3/movie/${movie.tmdbId}${isToken ? '' : `?api_key=${encodeURIComponent(key)}`}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: isToken ? { Authorization: `Bearer ${key}` } : {} });
  if (!res.ok) return { _id: movie.id }; // cache misses too, so we don't hammer TMDB
  const j = await res.json();
  return { _id: movie.id, posterPath: j.poster_path, backdropPath: j.backdrop_path, overview: j.overview, runtime: j.runtime };
}

async function loadOne(movie) {
  if (memory.has(movie.id)) return memory.get(movie.id);
  if (inflight.has(movie.id)) return inflight.get(movie.id);
  const p = (async () => {
    try {
      let doc = await MovieMeta.findById(movie.id).lean();
      if (!doc && config.tmdbApiKey && movie.tmdbId) {
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

export const _test = { memory };
