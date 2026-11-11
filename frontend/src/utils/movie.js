export const MOOD_INFO = {
  // Plain typographic glyphs (no emoji-presentation characters, so they print in our ink).
  'feel-good': { label: 'Feel-good', hint: 'Warm, uplifting, easy', glyph: '✳' },
  thrilling: { label: 'Thrilling', hint: 'Edge-of-your-seat', glyph: '↯' },
  'mind-bending': { label: 'Mind-bending', hint: 'Twists & big ideas', glyph: '◎' },
  emotional: { label: 'Emotional', hint: 'Bring the tissues', glyph: '♡' },
  dark: { label: 'Dark', hint: 'Gritty & intense', glyph: '●' },
  romantic: { label: 'Romantic', hint: 'Love stories', glyph: '∞' },
  funny: { label: 'Funny', hint: 'Laugh out loud', glyph: '※' },
  epic: { label: 'Epic', hint: 'Grand adventures', glyph: '▲' },
};

export const ERA_INFO = {
  classic: { label: 'Classics', range: 'before 1980', big: '’50s' },
  retro: { label: '80s & 90s', range: '1980–1999', big: '’80s' },
  modern: { label: '2000s', range: '2000–2009', big: '’00s' },
  recent: { label: 'Recent', range: '2010 onwards', big: '’10s' },
};

export const DISCOVERY_INFO = {
  mainstream: { label: 'Crowd-pleasers', hint: 'The movies everyone talks about', big: 'A' },
  balanced: { label: 'A healthy mix', hint: 'Hits plus a few surprises', big: 'B' },
  'hidden-gems': { label: 'Hidden gems', hint: 'Under-the-radar treasures', big: 'C' },
};

export const AUDIENCE_INFO = {
  solo: { label: 'Just me' },
  partner: { label: 'With a partner' },
  friends: { label: 'With friends' },
  family: { label: 'With family & kids' },
};

/**
 * Screen-print poster palette: [paper colour, ink colour, second (offset) ink].
 * Limited inks, like a two-colour silkscreen run.
 */
// [paper, title ink, motif ink, how the motif prints over the paper]
const INKS = [
  ['#e0341b', '#fff3df', '#16130f', 'multiply'], // red paper, black motif
  ['#e9b23c', '#16130f', '#e0341b', 'multiply'], // mustard paper, red motif
  ['#1d4b5a', '#f1e8d6', '#e9b23c', 'normal'], // teal paper, mustard motif
  ['#16130f', '#f1e8d6', '#e0341b', 'normal'], // black paper, red motif
  ['#e6dac2', '#16130f', '#1d4b5a', 'multiply'], // bone paper, teal motif
  ['#2d5a3d', '#f1e8d6', '#e0341b', 'normal'], // bottle-green paper, red motif
];
/** murmur3 fmix32 avalanche: neighbouring ids land on unrelated inks and motifs. */
function hash(n) {
  let h = Number(n) | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
export function posterInks(id) {
  const h = hash(id);
  const [bg, fg, accent, blend] = INKS[h % INKS.length];
  return { bg, fg, accent, blend, shape: (h >>> 8) % 4 };
}
/** Kept for places that need a single background (modal hero). */
export const posterGradient = (id) => posterInks(id).bg;

export const stars = (rating) => (Math.round(rating * 10) / 10).toFixed(1);
export const formatRuntime = (m) => (m ? `${Math.floor(m / 60)}h ${m % 60}m` : null);
export const pad2 = (n) => String(n).padStart(2, '0');

export function passwordStrength(pw = '') {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const level = Math.min(4, s);
  return { level, label: ['Too weak', 'Weak', 'Okay', 'Good', 'Strong'][level] };
}
