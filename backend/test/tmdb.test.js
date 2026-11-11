import { describe, it, expect } from 'vitest';
import { pickTrailer, shapeProviders } from '../src/services/tmdb.js';

describe('shapeProviders (TMDB watch/providers → where to watch)', () => {
  const p = (id, name, prio, logo = `/logo${id}.png`) => ({ provider_id: id, provider_name: name, display_priority: prio, logo_path: logo });

  it('groups by kind, sorts by TMDB display priority and builds logo URLs', () => {
    const out = shapeProviders({
      link: 'https://www.themoviedb.org/movie/862-toy-story/watch?locale=CA',
      flatrate: [p(2, 'Second', 5), p(1, 'Disney Plus', 1)],
      rent: [p(3, 'Apple TV Store', 2)],
      buy: [p(3, 'Apple TV Store', 2)],
    });
    expect(out.stream.map((x) => x.name)).toEqual(['Disney Plus', 'Second']);
    expect(out.stream[0].logo).toBe('https://image.tmdb.org/t/p/w92/logo1.png');
    expect(out.rent).toHaveLength(1);
    expect(out.free).toEqual([]);
    expect(out.link).toMatch(/^https:\/\/www\.themoviedb\.org\//);
  });

  it('handles a country with no data, and drops unsafe links and logo paths', () => {
    expect(shapeProviders(undefined)).toEqual({ link: null, stream: [], free: [], ads: [], rent: [], buy: [] });
    const out = shapeProviders({ link: 'javascript:alert(1)', flatrate: [p(1, 'X', 1, '/../../evil.svg"onload=x')] });
    expect(out.link).toBeNull();
    expect(out.stream[0].logo).toBeNull();
  });
});

const v = (o) => ({ site: 'YouTube', type: 'Trailer', key: 'abcdefghijk', official: false, iso_639_1: 'en', size: 1080, name: 'Trailer', ...o });

describe('pickTrailer (TMDB videos → the one to play)', () => {
  it('prefers official trailers over teasers and clips', () => {
    const t = pickTrailer([
      v({ type: 'Teaser', key: 'teaser00001', official: true }),
      v({ type: 'Clip', key: 'clip0000001', official: true }),
      v({ type: 'Trailer', key: 'unofficial1' }),
      v({ type: 'Trailer', key: 'official001', official: true, name: 'Official Trailer' }),
    ]);
    expect(t).toEqual({ key: 'official001', name: 'Official Trailer' });
  });

  it('prefers English, then higher resolution, then newer', () => {
    expect(pickTrailer([v({ key: 'french00001', iso_639_1: 'fr' }), v({ key: 'english0001' })]).key).toBe('english0001');
    expect(pickTrailer([v({ key: 'sd000000001', size: 480 }), v({ key: 'hd000000001', size: 1080 })]).key).toBe('hd000000001');
    expect(pickTrailer([v({ key: 'old00000001', published_at: '2010-01-01' }), v({ key: 'new00000001', published_at: '2020-01-01' })]).key).toBe('new00000001');
  });

  it('falls back to a teaser when there is no trailer', () => {
    expect(pickTrailer([v({ type: 'Featurette', key: 'feature0001' }), v({ type: 'Teaser', key: 'teaser00001' })]).key).toBe('teaser00001');
  });

  it('ignores non-YouTube videos and malformed ids (they become part of an embed URL)', () => {
    expect(pickTrailer([v({ site: 'Vimeo', key: 'vimeo000001' }), v({ key: 'bad" onload=x' }), v({ key: '../../evil00' })])).toBeNull();
    expect(pickTrailer([])).toBeNull();
    expect(pickTrailer(undefined)).toBeNull();
  });
});
