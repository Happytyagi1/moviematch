<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Movies } from '../api.js';
import AppLogo from './AppLogo.vue';
import Icon from './Icon.vue';
import MoviePoster from './MoviePoster.vue';

/* ------------------------------------------------------------- poster reel
 * A 3D cover-flow that advances on its own. Drag/swipe, arrows or keys to browse;
 * click a side poster to bring it forward; click the centre poster to sign in and see it. */
const router = useRouter();

// Shown immediately (as screen-print cards) so the panel is never empty; replaced by the real reel.
const reel = ref([
  { id: 79132, title: 'Inception', year: 2010, genres: ['Sci-Fi'] },
  { id: 5618, title: 'Spirited Away', year: 2001, genres: ['Fantasy'] },
  { id: 296, title: 'Pulp Fiction', year: 1994, genres: ['Crime'] },
  { id: 164909, title: 'La La Land', year: 2016, genres: ['Musical'] },
]);
const current = ref(0);
const hovering = ref(false);
const dragX = ref(0); // live drag offset in px
const SPACING = 120; // px between neighbouring posters
const VISIBLE = 4; // posters rendered on each side (the outermost one fades in/out, so 3 are fully visible)
const AUTOPLAY_MS = 400;
const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const n = computed(() => reel.value.length);
const centre = computed(() => reel.value[current.value]);
const wrap = (i) => ((i % n.value) + n.value) % n.value;
/** Signed distance from the centre on a circular reel, e.g. -2..+2. */
function offsetOf(i) {
  let d = i - current.value;
  if (d > n.value / 2) d -= n.value;
  if (d < -n.value / 2) d += n.value;
  return d;
}
const slides = computed(() =>
  reel.value
    .map((m, i) => ({ m, i, d: offsetOf(i) }))
    .filter((s) => Math.abs(s.d) <= VISIBLE),
);
function slideStyle(d) {
  const x = d * SPACING + dragX.value;
  const p = x / SPACING; // fractional position, follows the finger while dragging
  const abs = Math.min(Math.abs(p), VISIBLE);
  return {
    transform: `translateX(${x}px) translateZ(${-abs * 120}px) rotateY(${Math.max(-1, Math.min(1, p)) * -38}deg) scale(${1 - abs * 0.08})`,
    opacity: abs > VISIBLE - 0.5 ? 0 : 1 - abs * 0.18,
    zIndex: 100 - Math.round(abs * 10),
    filter: `brightness(${1 - Math.min(abs, 2) * 0.22})`,
  };
}

const go = (step) => { current.value = wrap(current.value + step); };
/** Seeing a film needs an account: go to sign in, then open this film on the home page. */
function openFilm(m) {
  router.push({ name: 'signin', query: { next: `/home?movie=${m.id}`, film: m.title } });
}
function select(i) {
  if (i === current.value) openFilm(reel.value[i]);
  else current.value = i;
}

// Autoplay: pauses on hover, while dragging, and for reduced motion.
let timer;
const paused = computed(() => hovering.value || dragging.value);
function startAutoplay() {
  clearInterval(timer);
  if (reducedMotion) return;
  timer = setInterval(() => { if (!paused.value && !document.hidden) go(1); }, AUTOPLAY_MS);
}

// Pointer drag / swipe.
const dragging = ref(false);
let startX = 0;
let moved = false;
function onDown(e) {
  if (e.button > 0) return;
  dragging.value = true;
  moved = false;
  startX = e.clientX;
}
function onMove(e) {
  if (!dragging.value) return;
  dragX.value = e.clientX - startX;
  if (!moved && Math.abs(dragX.value) > 6) {
    moved = true;
    // Capture only once it's a real drag, so plain clicks still reach the poster.
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
}
function onUp() {
  if (!dragging.value) return;
  dragging.value = false;
  const steps = Math.round(-dragX.value / SPACING) || (Math.abs(dragX.value) > 40 ? -Math.sign(dragX.value) : 0);
  dragX.value = 0;
  if (steps) go(steps);
}
function onSlideClick(i) {
  if (moved) { moved = false; return; } // it was a drag, not a click
  select(i);
}
function onKey(e) {
  if (e.key === 'ArrowRight') go(1);
  else if (e.key === 'ArrowLeft') go(-1);
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFilm(centre.value); }
}

onMounted(async () => {
  startAutoplay();
  try {
    const { movies } = await Movies.showcase();
    if (movies?.length) { reel.value = movies; current.value = 0; }
  } catch {
    /* keep the designed cards */
  }
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <main class="auth">
    <section class="panel">
      <RouterLink to="/" class="logo-link" aria-label="MovieMatch home"><AppLogo /></RouterLink>
      <div class="ticket fade-up">
        <div class="ticket-body"><slot /></div>
        <div class="ticket-stub" aria-hidden="true">
          <span>Admit one</span>
          <span class="no">№ {{ String(new Date().getDate() * 37 + 1000) }}</span>
        </div>
      </div>
      <p class="legal label">Sessions protected by encrypted, HttpOnly tokens</p>
    </section>
    <aside class="art" aria-label="Films in the MovieMatch archive" @mouseenter="hovering = true" @mouseleave="hovering = false">
        <div class="reel-wrap">
          <div
            class="reel" :class="{ dragging }" tabindex="0" role="listbox" aria-roledescription="carousel"
            :aria-activedescendant="centre ? `reel-${centre.id}` : undefined"
            @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp" @keydown="onKey"
            @focus="hovering = true" @blur="hovering = false"
          >
            <button
              v-for="s in slides" :id="`reel-${s.m.id}`" :key="s.m.id" type="button" tabindex="-1" role="option"
              class="slide" :class="{ centre: s.d === 0 }" :style="slideStyle(s.d)" :aria-selected="s.d === 0"
              :aria-label="s.d === 0 ? `${s.m.title} (${s.m.year}), sign in to see it` : `Show ${s.m.title}`"
              @click="onSlideClick(s.i)" @dragstart.prevent
            >
              <MoviePoster :movie="s.m" />
            </button>
          </div>
          <div class="reel-caption" aria-live="polite">
            <b>{{ centre?.title }}</b>
            <span>{{ centre?.year }} · {{ centre?.genres?.slice(0, 2).join(' / ') }}</span>
          </div>
          <div class="reel-controls">
            <button type="button" class="ctl" aria-label="Previous film" @click="go(-1)"><Icon name="left" :size="18" /></button>
            <span class="hint-text">Drag to browse · click a poster to see it</span>
            <button type="button" class="ctl" aria-label="Next film" @click="go(1)"><Icon name="right" :size="18" /></button>
          </div>
        </div>
      <blockquote>
        “Find the film you didn’t know you were looking for.”
        <span>— MovieMatch, programme note I</span>
      </blockquote>
    </aside>
  </main>
</template>

<style scoped>
.auth { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); }
.panel { padding: 28px clamp(16px, 5vw, 72px); display: flex; flex-direction: column; align-items: center; }
.logo-link { align-self: flex-start; }
.ticket { margin: auto 0; width: 100%; max-width: 500px; display: grid; grid-template-columns: 1fr 46px; filter: drop-shadow(8px 8px 0 var(--ink)); }
.ticket-body, .ticket-stub { background: var(--card); border: 2px solid var(--ink); }
.ticket-body { padding: clamp(24px, 4vw, 40px); border-right: 0; border-radius: 4px 0 0 4px; }
/* perforated tear line + punched stub */
.ticket-stub {
  position: relative; border-left: 2px dashed var(--ink); border-radius: 0 4px 4px 0; background: var(--mustard);
  display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 18px 0;
  writing-mode: vertical-rl; font: 700 12px var(--mono); text-transform: uppercase; letter-spacing: 0.25em;
}
.ticket-stub .no { color: var(--red-deep); }
.legal { margin-top: 26px; }
.art {
  position: relative; overflow: hidden; display: grid; place-items: center; padding: 40px; border-left: 2px solid var(--ink);
  background: radial-gradient(circle at 70% 30%, rgba(233, 178, 60, 0.35), transparent 45%), var(--teal);
}
.art::before { content: ''; position: absolute; inset: 0; background-image: radial-gradient(circle, rgba(0, 0, 0, 0.28) 1.2px, transparent 1.6px); background-size: 8px 8px; }
.reel-wrap { position: relative; z-index: 1; } /* above the halftone overlay */

/* --- reel --- */
.reel-wrap { width: 100%; display: grid; justify-items: center; gap: 18px; margin-bottom: 120px; }
.reel {
  position: relative; width: 100%; height: 360px; perspective: 1100px; transform-style: preserve-3d; outline: none;
  cursor: grab; touch-action: pan-y; user-select: none; animation: reel-in 0.7s var(--ease) both;
}
.reel.dragging { cursor: grabbing; }
.reel:focus-visible { outline: 3px dashed var(--mustard); outline-offset: 6px; }
.slide {
  position: absolute; left: 50%; top: 0; width: 220px; margin-left: -110px; padding: 0; border: 2px solid var(--ink); border-radius: 3px;
  overflow: hidden; background: var(--ink); box-shadow: 8px 8px 0 var(--ink); cursor: pointer;
  transition: transform 0.5s var(--ease), opacity 0.5s var(--ease), filter 0.5s var(--ease);
}
.reel.dragging .slide { transition: none; }
.slide :deep(img) { pointer-events: none; }
.slide.centre { box-shadow: 10px 10px 0 var(--ink), 0 0 0 3px var(--mustard); }
.slide.centre:hover { box-shadow: 10px 10px 0 var(--ink), 0 0 0 5px var(--mustard); }
@keyframes reel-in { from { opacity: 0; transform: translateX(120px); } }
.reel-caption { display: grid; justify-items: center; gap: 4px; color: #f6eedd; text-align: center; min-height: 54px; }
.reel-caption b { font: 900 30px/1 var(--display); text-transform: uppercase; }
.reel-caption span { font: 700 12px var(--mono); text-transform: uppercase; letter-spacing: 0.12em; color: var(--mustard); }
.reel-controls { display: flex; align-items: center; gap: 16px; }
.reel-controls .hint-text { font: italic 400 15px var(--serif); color: rgba(246, 238, 221, 0.75); }
.ctl { width: 42px; height: 42px; display: grid; place-items: center; border: 2px solid var(--ink); border-radius: 50%; background: var(--paper); box-shadow: 3px 3px 0 var(--ink); }
.ctl:hover { background: var(--mustard); }
.ctl:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 var(--ink); }

@media (prefers-reduced-motion: reduce) { .slide { transition: none; } .reel { animation: none; } }

blockquote { position: absolute; bottom: 44px; left: 48px; right: 48px; margin: 0; color: #f6eedd; font: italic 400 clamp(22px, 2vw, 28px)/1.3 var(--serif); }
blockquote span { display: block; margin-top: 10px; font: 700 12px var(--mono); font-style: normal; text-transform: uppercase; letter-spacing: 0.14em; color: var(--mustard); }
@media (max-width: 900px) { .auth { grid-template-columns: 1fr; } .art { display: none; } }
@media (max-width: 460px) { .ticket { grid-template-columns: 1fr; } .ticket-stub { display: none; } .ticket-body { border-right: 2px solid var(--ink); border-radius: 4px; } }
</style>

<!-- Shared styles for the auth screens (sign in, sign up). -->
<style>
.auth-form { display: grid; gap: 14px; }
.auth-eyebrow { font: 700 12.5px var(--mono); text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-3); }
.auth-title { font-size: clamp(46px, 6vw, 68px); font-weight: 900; margin: 6px 0 24px; }
.auth-input { position: relative; }
.auth-input > svg { position: absolute; left: 15px; top: 26px; transform: translateY(-50%); color: var(--ink-3); pointer-events: none; }
.auth-input .input { padding-left: 44px; }
.auth-input .toggle { position: absolute; right: 8px; top: 26px; transform: translateY(-50%); background: none; border: 0; font: 700 11.5px var(--mono); text-transform: uppercase; letter-spacing: 0.08em; padding: 8px 10px; border-radius: 2px; }
.auth-input .toggle:hover { background: var(--mustard); }
.auth-input:has(.toggle) .input { padding-right: 72px; }
.auth-input .field-error { margin-top: 6px; }
.auth-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 15px; white-space: nowrap; }
@media (max-width: 400px) { .auth-row { font-size: 13.5px; gap: 8px; } }
.check { display: inline-flex; align-items: center; gap: 9px; cursor: pointer; user-select: none; }
.check input { width: 18px; height: 18px; cursor: pointer; }
.text-link { color: var(--red-deep); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 2px; }
.text-link:hover { background: var(--mustard); color: var(--ink); text-decoration: none; }
.auth-submit { width: 100%; margin-top: 6px; }
.auth-divider { display: flex; align-items: center; gap: 12px; font: 700 11px var(--mono); text-transform: uppercase; letter-spacing: 0.2em; color: var(--ink-3); margin: 6px 0; }
.auth-divider::before, .auth-divider::after { content: ''; flex: 1; border-top: 2px dashed var(--rule-strong); }
.auth-foot { text-align: center; margin-top: 20px; }
.alert { padding: 12px 16px; border: 2px solid var(--ink); border-radius: 3px; font: 400 14px/1.4 var(--mono); margin-bottom: 16px; }
.alert.error { background: #fbd9cf; border-color: var(--red-deep); color: var(--red-deep); box-shadow: 4px 4px 0 var(--red-deep); }
.alert.info { background: #f6e3b4; border-color: var(--ink); color: var(--ink); box-shadow: 4px 4px 0 var(--red); }
.alert.success { background: #dbe8d5; border-color: var(--ok); color: var(--ok); box-shadow: 4px 4px 0 var(--ok); }
.spinner { width: 18px; height: 18px; border-radius: 50%; border: 3px solid rgba(255, 248, 236, 0.4); border-top-color: #fff8ec; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.strength { display: flex; align-items: center; gap: 4px; margin-top: 8px; }
.strength span { flex: 1; height: 6px; border: 1.5px solid var(--ink); background: transparent; transition: background 0.2s; }
.strength[data-level='1'] span.on { background: var(--red); }
.strength[data-level='2'] span.on { background: var(--mustard); }
.strength[data-level='3'] span.on, .strength[data-level='4'] span.on { background: var(--ok); }
.strength em { font: 700 11px var(--mono); font-style: normal; text-transform: uppercase; color: var(--ink-3); min-width: 64px; text-align: right; }
</style>
