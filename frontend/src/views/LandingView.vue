<script setup>
import AppLogo from '../components/AppLogo.vue';
import MoviePoster from '../components/MoviePoster.vue';

// Marquee letter-board lines. Every character becomes a tile that drops in.
const lines = [
  { text: 'STOP SCROLLING.', tone: 'ink' },
  { text: 'START WATCHING.', tone: 'red' },
];
let n = 0;
const boards = lines.map((l) => ({ ...l, chars: [...l.text].map((c) => ({ c, i: n++ })) }));

// Decorative strip of screen-printed posters (no API call on the public page).
const reel = [
  ['The Matrix', 1999, 'Sci-Fi'], ['Toy Story', 1995, 'Animation'], ['Pulp Fiction', 1994, 'Crime'], ['Amélie', 2001, 'Romance'],
  ['The Shining', 1980, 'Horror'], ['Spirited Away', 2001, 'Fantasy'], ['Casablanca', 1942, 'Drama'], ['Jurassic Park', 1993, 'Adventure'],
  ['Alien', 1979, 'Horror'], ['Superbad', 2007, 'Comedy'], ['Mad Max: Fury Road', 2015, 'Action'], ['Up', 2009, 'Animation'],
].map(([title, year, g], i) => ({ id: i * 5 + 1, title, year, genres: [g] }));

const notes = [
  { n: 'I', title: 'The screen test', text: 'Two minutes of questions: the genres you love, the films you’d rewatch, the mood you’re usually in. No rating marathons.' },
  { n: 'II', title: 'The projectionist', text: 'A hybrid model trained on 100,000 real ratings finds what people with your taste loved — and why.' },
  { n: 'III', title: 'The encore', text: 'Every thumbs-up and thumbs-down recuts your list on the spot. Tomorrow’s picks are better than today’s.' },
];
</script>

<template>
  <main class="landing">
    <header class="container top">
      <AppLogo />
      <nav class="top-nav">
        <span class="label hide-sm">Tonight · Showing · Everywhere</span>
        <RouterLink to="/signin" class="btn btn-sm btn-ghost">Sign in</RouterLink>
      </nav>
    </header>

    <section class="container hero">
      <p class="slug fade-up">FADE IN: &nbsp;INT. YOUR COUCH — TONIGHT</p>

      <div class="marquee" aria-label="Stop scrolling. Start watching.">
        <span class="bulbs" aria-hidden="true" />
        <div class="board" aria-hidden="true">
          <div v-for="(b, li) in boards" :key="li" class="line" :class="b.tone">
            <span v-for="ch in b.chars" :key="ch.i" class="tile" :class="{ space: ch.c === ' ' }" :style="{ animationDelay: `${0.25 + ch.i * 0.045}s` }">{{ ch.c }}</span>
          </div>
        </div>
        <p class="now">Now showing: <em>films picked for you</em></p>
      </div>

      <div class="below">
        <p class="lead fade-up" style="animation-delay: 1.5s">
          MovieMatch asks a few good questions, then a recommender trained on real audiences programmes a season of films for you — each with a note on <em>why</em> it made the cut.
        </p>
        <div class="ctas fade-up" style="animation-delay: 1.65s">
          <RouterLink to="/signup" class="btn btn-primary btn-lg">Get my picks →</RouterLink>
          <RouterLink to="/signin" class="btn btn-lg">I have a ticket</RouterLink>
          <span class="admit label">Admit one · free · 3,650 films</span>
        </div>
      </div>
    </section>

    <section class="reel" aria-hidden="true">
      <div class="filmstrip" />
      <div class="reel-track">
        <div v-for="(m, k) in [...reel, ...reel]" :key="k" class="frame"><MoviePoster :movie="m" /></div>
      </div>
      <div class="filmstrip" />
    </section>

    <section class="container notes">
      <h2 class="notes-title">Programme notes</h2>
      <div class="cols">
        <article v-for="(nt, i) in notes" :key="nt.n" class="note fade-up" :style="{ animationDelay: `${1.8 + i * 0.12}s` }">
          <span class="roman">{{ nt.n }}</span>
          <h3>{{ nt.title }}</h3>
          <p>{{ nt.text }}</p>
        </article>
      </div>
    </section>

  </main>
</template>

<style scoped>
.landing { min-height: 100vh; overflow: hidden; }
.top { display: flex; justify-content: space-between; align-items: center; height: 88px; }
.top-nav { display: flex; align-items: center; gap: 22px; }
.hero { padding-top: clamp(16px, 4vh, 44px); }
.slug { font: 700 13px var(--mono); letter-spacing: 0.14em; color: var(--ink-2); margin-bottom: 22px; }

/* ---- the marquee sign ---- */
.marquee {
  --bulb: 10px;
  position: relative; display: inline-block; max-width: 100%; padding: 34px clamp(18px, 3vw, 40px) 26px;
  background: var(--ink); border-radius: 6px; box-shadow: 10px 10px 0 var(--red);
}
.bulbs {
  position: absolute; inset: 9px; border-radius: 4px; pointer-events: none;
  /* a frame of bulbs: dotted border image made of radial gradients, chasing */
  background:
    radial-gradient(circle, #ffe7a6 0 3px, rgba(255, 210, 110, 0.35) 4px, transparent 6px) 0 0 / 22px 22px repeat-x,
    radial-gradient(circle, #ffe7a6 0 3px, rgba(255, 210, 110, 0.35) 4px, transparent 6px) 0 100% / 22px 22px repeat-x,
    radial-gradient(circle, #ffe7a6 0 3px, rgba(255, 210, 110, 0.35) 4px, transparent 6px) 0 0 / 22px 22px repeat-y,
    radial-gradient(circle, #ffe7a6 0 3px, rgba(255, 210, 110, 0.35) 4px, transparent 6px) 100% 0 / 22px 22px repeat-y;
  animation: chase 0.9s steps(2) infinite, bulbs-on 1.2s ease-out both;
}
@keyframes chase { to { background-position: 22px 0, -22px 100%, 0 -22px, 100% 22px; } }
@keyframes bulbs-on { from { opacity: 0; } 40% { opacity: 1; } 55% { opacity: 0.3; } to { opacity: 1; } }
.board { display: grid; gap: 8px; }
.line { display: flex; flex-wrap: wrap; gap: clamp(3px, 0.5vw, 6px); }
.tile {
  display: inline-grid; place-items: center; width: clamp(24px, 5.1vw, 72px); height: clamp(36px, 7.4vw, 104px);
  background: #fbf5e7; color: var(--ink); border-radius: 3px;
  font: 900 clamp(28px, 6.4vw, 92px)/1 var(--display);
  box-shadow: inset 0 -4px 0 rgba(0, 0, 0, 0.12);
  animation: drop-in 0.55s var(--ease) both;
}
.line.red .tile { color: var(--red); }
.tile.space { background: transparent; box-shadow: none; width: clamp(10px, 2vw, 26px); }
.now { margin-top: 18px; color: var(--mustard); font: 700 13px var(--mono); text-transform: uppercase; letter-spacing: 0.16em; }
.now em { font: italic 400 18px var(--serif); text-transform: none; letter-spacing: 0; color: #fbf5e7; }

.below { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 32px; align-items: end; margin-top: 40px; }
.lead { font-size: clamp(18px, 1.7vw, 22px); line-height: 1.5; max-width: 560px; }
.lead em { color: var(--red); }
.ctas { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; justify-content: flex-end; }
.admit { width: 100%; text-align: right; }

/* ---- the film reel ---- */
.reel { margin-top: clamp(48px, 8vh, 90px); transform: rotate(-2deg); width: 110vw; margin-left: -5vw; box-shadow: 0 10px 0 rgba(22, 19, 15, 0.08); }
.reel-track { display: flex; gap: 14px; padding: 14px 7px; background: var(--ink); width: max-content; animation: roll 60s linear infinite; }
.frame { width: 132px; flex: none; border: 2px solid #000; }
@keyframes roll { to { transform: translateX(-50%); } }

/* ---- programme notes ---- */
.notes { padding-top: 70px; }
.notes-title { font-size: clamp(40px, 6vw, 78px); border-bottom: 3px solid var(--ink); padding-bottom: 10px; }
.cols { display: grid; grid-template-columns: repeat(3, 1fr); }
.note { padding: 26px 28px 30px 0; display: grid; gap: 10px; align-content: start; }
.note + .note { padding-left: 28px; border-left: 2px solid var(--ink); }
.roman { font: 900 54px/1 var(--display); color: var(--red); }
.note h3 { font-size: 30px; }
.note p { color: var(--ink-2); }
.foot { padding: 50px 0 36px; text-align: center; }

@media (max-width: 860px) {
  .below { grid-template-columns: 1fr; }
  .ctas { justify-content: flex-start; }
  .admit { text-align: left; }
  .cols { grid-template-columns: 1fr; }
  .note + .note { border-left: 0; border-top: 2px solid var(--ink); padding-left: 0; }
  .hide-sm { display: none; }
}
</style>
