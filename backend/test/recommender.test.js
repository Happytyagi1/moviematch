import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { Recommender, topK, normalizeText } from '../src/ml/recommender.js';

let rec;
const id = (title) => rec.movies.find((m) => m.title === title).id;

beforeAll(() => {
  rec = Recommender.load(path.resolve(import.meta.dirname, '../model'));
});

describe('model artifact', () => {
  it('loads every movie with unit-length embeddings', () => {
    expect(rec.n).toBeGreaterThan(3000);
    for (const i of [0, 100, rec.n - 1]) {
      const v = rec.row(i);
      expect(Math.hypot(...v)).toBeCloseTo(1, 3);
    }
  });

  it('exposes evaluation showing the model beats the popularity baseline', () => {
    const { evaluation } = rec.info();
    expect(evaluation.best.metrics['ndcg@10']).toBeGreaterThan(evaluation.baselines.popularity['ndcg@10']);
  });
});

describe('recommend()', () => {
  it('learns taste from favourites: Pixar fans get family animation', () => {
    const prefs = { favoriteMovies: [id('Toy Story'), id('Finding Nemo'), id('Up')], genres: ['Animation'] };
    const recs = rec.recommend({ prefs, limit: 10 });
    expect(recs).toHaveLength(10);
    const animated = recs.filter((m) => m.genres.includes('Animation') || m.genres.includes('Children'));
    expect(animated.length).toBeGreaterThanOrEqual(6);
  });

  it('gives sci-fi fans and romance fans different results', () => {
    const scifi = rec.recommend({ prefs: { favoriteMovies: [id('The Matrix'), id('Alien'), id('Blade Runner')], genres: ['Sci-Fi'] }, limit: 10 });
    const romance = rec.recommend({ prefs: { favoriteMovies: [id('The Notebook'), id('Pretty Woman'), id('Titanic')], genres: ['Romance'] }, limit: 10 });
    const overlap = scifi.filter((a) => romance.some((b) => b.id === a.id));
    expect(overlap.length).toBeLessThanOrEqual(1);
    expect(scifi.filter((m) => m.genres.includes('Sci-Fi')).length).toBeGreaterThanOrEqual(5);
  });

  it('never recommends favourites, watched or disliked movies', () => {
    const fav = [id('The Matrix'), id('Inception'), id('Interstellar')];
    const interactions = [
      { movieId: id('The Dark Knight'), watched: true },
      { movieId: id('Avatar'), reaction: 'dislike' },
    ];
    const ids = rec.recommend({ prefs: { favoriteMovies: fav }, interactions, limit: 50 }).map((m) => m.id);
    for (const x of [...fav, id('The Dark Knight'), id('Avatar')]) expect(ids).not.toContain(x);
  });

  it('hard-filters avoided genres and horror for family audiences', () => {
    const a = rec.recommend({ prefs: { genres: ['Comedy'], favoriteMovies: [id('The Shining')], avoidGenres: ['Romance'] }, limit: 40 });
    expect(a.some((m) => m.genres.includes('Romance'))).toBe(false);
    const f = rec.recommend({ prefs: { genres: ['Horror'], favoriteMovies: [id('The Shining')], audience: 'family' }, limit: 40 });
    expect(f.some((m) => m.genres.some((g) => ['Horror', 'Crime', 'Thriller'].includes(g)))).toBe(false);
    const kidsFav = rec.recommend({ prefs: { genres: ['Comedy'], favoriteMovies: [id('Shrek')], audience: 'family' }, limit: 60 });
    expect(kidsFav.map((m) => m.title)).not.toContain('Ted'); // tagged "crude humor"
  });

  it('applies mood and genre filters', () => {
    const prefs = { favoriteMovies: [id('Toy Story')], genres: ['Comedy'] };
    const dark = rec.recommend({ prefs, mood: 'dark', limit: 15 });
    for (const m of dark) expect(m.genres.some((g) => ['Horror', 'Crime', 'Film-Noir', 'Thriller'].includes(g))).toBe(true);
    const war = rec.recommend({ prefs, genre: 'War', limit: 10 });
    for (const m of war) expect(m.genres).toContain('War');
  });

  it('hidden gems are less popular and well rated', () => {
    const gems = rec.recommend({ prefs: { genres: ['Drama'], favoriteMovies: [id('Fight Club')] }, hiddenGems: true, limit: 15 });
    expect(gems.length).toBeGreaterThan(0);
    for (const m of gems) {
      expect(m.popularity).toBeLessThanOrEqual(0.62);
      expect(m.rating).toBeGreaterThanOrEqual(3.6);
    }
  });

  it('filters by release era and top rating, alone and combined', () => {
    const prefs = { genres: ['Comedy'], favoriteMovies: [id('Toy Story')] };
    const retro = rec.recommend({ prefs, era: 'retro', limit: 20 });
    expect(retro).toHaveLength(20);
    for (const m of retro) expect(m.year >= 1980 && m.year <= 1999).toBe(true);
    const top = rec.recommend({ prefs, topRated: true, limit: 20 });
    expect(top).toHaveLength(20);
    for (const m of top) {
      expect(m.rating).toBeGreaterThanOrEqual(3.7);
      expect(m.ratingCount).toBeGreaterThanOrEqual(20);
    }
    const both = rec.recommend({ prefs, era: 'classic', topRated: true, mood: 'funny', limit: 10 });
    expect(both.length).toBeGreaterThan(0);
    for (const m of both) expect(m.year < 1980 && m.rating >= 3.7 && m.genres.includes('Comedy')).toBe(true);
  });

  it('moves user taste with feedback (likes pull results toward a movie)', () => {
    const prefs = { genres: ['Comedy'], favoriteMovies: [id('Toy Story')] };
    const before = rec.recommend({ prefs, limit: 30 }).map((m) => m.id);
    const after = rec.recommend({ prefs, limit: 30, interactions: [{ movieId: id('Alien'), reaction: 'like' }, { movieId: id('Aliens'), reaction: 'like' }, { movieId: id('The Terminator'), reaction: 'like' }] });
    expect(after.filter((m) => m.genres.includes('Sci-Fi')).length).toBeGreaterThan(
      before.map((x) => rec.getMovie(x)).filter((m) => m.genres.includes('Sci-Fi')).length,
    );
  });

  it('explains every pick and returns a sensible match %', () => {
    const recs = rec.recommend({ prefs: { favoriteMovies: [id('Toy Story'), id('Shrek'), id('Up')], genres: ['Animation'] }, limit: 10 });
    for (const m of recs) {
      expect(m.reason.text).toBeTruthy();
      expect(m.match).toBeGreaterThanOrEqual(50);
      expect(m.match).toBeLessThanOrEqual(99);
    }
    expect(recs.some((m) => m.reason.type === 'similar')).toBe(true);
  });

  it('works for a brand-new user with no signal (popular + well rated)', () => {
    const recs = rec.recommend({ limit: 10 });
    expect(recs).toHaveLength(10);
    expect(recs.reduce((s, m) => s + m.popularity, 0) / 10).toBeGreaterThan(0.6);
  });

  it('paginates without duplicates', () => {
    const prefs = { genres: ['Action'], favoriteMovies: [id('Die Hard')] };
    const p1 = rec.recommend({ prefs, limit: 10 }).map((m) => m.id);
    const p2 = rec.recommend({ prefs, limit: 10, offset: 10 }).map((m) => m.id);
    expect(new Set([...p1, ...p2]).size).toBe(20);
  });

  it('is fast: < 15 ms per request on average', () => {
    const prefs = { genres: ['Action', 'Sci-Fi'], favoriteMovies: [id('The Matrix'), id('Alien'), id('Up')], moods: ['thrilling'], eras: ['retro'] };
    rec.recommend({ prefs }); // warm-up
    const t = performance.now();
    for (let k = 0; k < 50; k++) rec.recommend({ prefs, limit: 20 });
    expect((performance.now() - t) / 50).toBeLessThan(15);
  });
});

describe('similar / search / seeds', () => {
  it('finds sequels as nearest neighbours', () => {
    const titles = rec.similar(id('Toy Story'), 5).map((m) => m.title);
    expect(titles).toContain('Toy Story 2');
  });

  it('searches accent- and case-insensitively, prefix matches first', () => {
    expect(rec.search('matrix')[0].title).toBe('The Matrix');
    expect(rec.search('LEON').some((m) => m.title.startsWith('Léon'))).toBe(true);
    expect(rec.search('   ')).toEqual([]);
  });

  it('previews give three fitting films for every quiz card', () => {
    const p = rec.previews();
    for (const group of ['moods', 'eras', 'discovery']) for (const list of Object.values(p[group])) expect(list).toHaveLength(3);
    for (const m of p.eras.retro) expect(m.year >= 1980 && m.year <= 1999).toBe(true);
    for (const m of p.discovery['hidden-gems']) expect(m.popularity).toBeLessThanOrEqual(0.55);
  });

  it('seeds paginate without overlap', () => {
    const p1 = rec.seeds({ genres: ['Comedy', 'Drama'], limit: 48 }).map((m) => m.id);
    const p2 = rec.seeds({ genres: ['Comedy', 'Drama'], limit: 48, offset: 48 }).map((m) => m.id);
    expect(p1).toHaveLength(48);
    expect(p2).toHaveLength(48);
    expect(p1.filter((x) => p2.includes(x))).toEqual([]);
  });

  it('seeds cover the requested genres without duplicates', () => {
    const s = rec.seeds({ genres: ['Horror', 'Romance'], limit: 20 });
    expect(s).toHaveLength(20);
    expect(new Set(s.map((m) => m.id)).size).toBe(20);
    expect(s.some((m) => m.genres.includes('Horror'))).toBe(true);
    expect(s.some((m) => m.genres.includes('Romance'))).toBe(true);
  });
});

describe('helpers', () => {
  it('topK matches a full sort', () => {
    const scores = Float32Array.from({ length: 500 }, () => Math.random());
    const idx = [...scores.keys()];
    const expected = [...idx].sort((a, b) => scores[b] - scores[a]).slice(0, 25);
    expect(topK(idx, scores, 25)).toEqual(expected);
  });

  it('normalizeText strips accents and punctuation', () => {
    expect(normalizeText('Amélie: Le Fabuleux!')).toBe('amelie le fabuleux');
  });
});
