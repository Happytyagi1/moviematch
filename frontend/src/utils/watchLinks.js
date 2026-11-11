/**
 * Where a "Where to watch" logo should take you.
 *
 * TMDB/JustWatch don't give deep links to a film's page on each service (those need a
 * JustWatch partner agreement), so for well-known services we open the service's own
 * search for the title; the film is normally the first result. Anything else falls
 * back to the film's TMDB "where to watch" page, which has JustWatch links to every service.
 *
 * Order matters: "<Service> Amazon Channel" subscriptions are watched inside Prime Video,
 * so Amazon is matched before the channel's own brand.
 */
const SEARCH = [
  [/amazon|prime video/i, (q) => `https://www.primevideo.com/search?phrase=${q}`],
  [/netflix/i, (q) => `https://www.netflix.com/search?q=${q}`],
  [/apple tv/i, (q) => `https://tv.apple.com/search?term=${q}`],
  [/google play/i, (q) => `https://play.google.com/store/search?q=${q}&c=movies`],
  [/youtube/i, (q) => `https://www.youtube.com/results?search_query=${q}%20movie`],
  [/hulu/i, (q) => `https://www.hulu.com/search?q=${q}`],
  [/paramount/i, (q) => `https://www.paramountplus.com/search/?q=${q}`],
  [/tubi/i, (q) => `https://tubitv.com/search/${q}`],
  [/plex/i, (q) => `https://watch.plex.tv/search?q=${q}`],
  [/mubi/i, (q) => `https://mubi.com/en/search/films?query=${q}`],
];
// Deliberately not listed (their search URLs 404 or can't be verified): Disney+, Crunchyroll.
// They use the TMDB fallback page, which links to the right title on each service.

/**
 * @param {string} providerName  e.g. "Netflix", "Paramount+ Amazon Channel"
 * @param {string} title         the film's title
 * @param {string|null} fallback the film's TMDB watch page for this country
 * @returns {{ href: string, viaSearch: boolean } | null}
 */
export function watchLink(providerName, title, fallback) {
  const q = encodeURIComponent(String(title || '').trim());
  const hit = q && SEARCH.find(([re]) => re.test(providerName || ''));
  if (hit) return { href: hit[1](q), viaSearch: true };
  return fallback ? { href: fallback, viaSearch: false } : null;
}
