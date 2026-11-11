<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Movies } from '../api.js';
import { useAuth } from '../stores/auth.js';
import { useUi } from '../stores/ui.js';
import MovieRow from '../components/MovieRow.vue';
import MovieCard from '../components/MovieCard.vue';
import MoviePoster from '../components/MoviePoster.vue';
import Icon from '../components/Icon.vue';
import { ERA_INFO, MOOD_INFO, stars } from '../utils/movie.js';

const auth = useAuth();
const ui = useUi();
const route = useRoute();
const router = useRouter();
const sections = ref([]);
const loading = ref(true);
const error = ref('');

// Filters on the film strip: one mood, one release era and one rating lens, combinable.
const QUALITY_INFO = {
  'top-rated': { label: 'Top rated', glyph: '★' },
  'hidden-gems': { label: 'Hidden gems', glyph: '◆' },
};
const mood = ref(null);
const era = ref(null);
const quality = ref(null);
const anyFilter = computed(() => !!(mood.value || era.value || quality.value));
const filterTitle = computed(() =>
  [MOOD_INFO[mood.value]?.label, ERA_INFO[era.value]?.label, QUALITY_INFO[quality.value]?.label].filter(Boolean).join(' · '),
);
const moodItems = ref([]);
const moodLoading = ref(false);
const moodDone = ref(false);
let moodCtl;

// Tonight's feature: a random pick from the top of the user's ranked list, so every
// visit (and every "Another pick" click) shows a different, still well-matched film.
const FEATURE_POOL = 10;
const LAST_KEY = 'mm_last_feature';
const featuredId = ref(null);
const featurePool = computed(() => (sections.value[0]?.items || []).slice(0, FEATURE_POOL));
const featured = computed(() => featurePool.value.find((m) => m.id === featuredId.value) || featurePool.value[0]);

function shuffleFeature() {
  const pool = featurePool.value;
  if (!pool.length) return;
  let last = featuredId.value;
  if (last == null) {
    try { last = JSON.parse(sessionStorage.getItem(LAST_KEY)); } catch { /* storage unavailable */ }
  }
  const choices = pool.length > 1 ? pool.filter((m) => m.id !== last) : pool;
  featuredId.value = choices[Math.floor(Math.random() * choices.length)].id;
  try { sessionStorage.setItem(LAST_KEY, JSON.stringify(featuredId.value)); } catch { /* ignore */ }
}
const featuredState = computed(() => (featured.value ? ui.stateOf(featured.value.id) : {}));

// "Play trailer" for tonight's feature: only shown when TMDB has one for this film.
const featuredTrailer = ref(null);
let trailerCtl;
watch(
  () => featured.value?.id,
  async (id) => {
    featuredTrailer.value = null;
    trailerCtl?.abort();
    if (!id) return;
    trailerCtl = new AbortController();
    try {
      const { trailer } = await Movies.trailer(id, trailerCtl.signal);
      if (featured.value?.id === id) featuredTrailer.value = trailer;
    } catch {
      /* no button then */
    }
  },
);
const slug = computed(() => {
  const h = new Date().getHours();
  const time = h < 5 ? 'LATE NIGHT' : h < 12 ? 'MORNING' : h < 18 ? 'AFTERNOON' : 'NIGHT';
  return `INT. YOUR COUCH — ${time}`;
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    sections.value = (await Movies.home()).sections;
    shuffleFeature();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

const filterRefs = { mood, era, quality };
async function pickFilter(kind, value) {
  const f = filterRefs[kind];
  f.value = f.value === value ? null : value;
  await refreshFilters();
}
async function clearFilters() {
  mood.value = era.value = quality.value = null;
  await refreshFilters();
}
async function refreshFilters() {
  moodItems.value = [];
  moodDone.value = false;
  if (anyFilter.value) await loadMood();
  else moodCtl?.abort();
}
async function loadMood() {
  moodCtl?.abort();
  moodCtl = new AbortController();
  moodLoading.value = true;
  try {
    const params = { mood: mood.value, era: era.value, quality: quality.value, limit: 24, offset: moodItems.value.length };
    for (const k of Object.keys(params)) if (params[k] == null) delete params[k];
    const { items } = await Movies.recommendations(params, moodCtl.signal);
    moodItems.value.push(...items);
    moodDone.value = items.length < 24;
  } catch (e) {
    if (e.name !== 'AbortError') ui.toast(e.message, 'error');
  } finally {
    moodLoading.value = false;
  }
}

onMounted(() => {
  load();
  // Arrived from a poster on the sign-in reel ("/home?movie=<id>"): open that film, then tidy the URL.
  const id = Number(route.query.movie);
  if (Number.isInteger(id) && id > 0) {
    ui.openMovie(id);
    const { movie, ...rest } = route.query;
    router.replace({ query: rest });
  }
});
</script>

<template>
  <main class="home">
    <!-- Tonight's feature -->
    <section v-if="featured" :key="featured.id" class="feature container">
      <div class="feature-poster" @click="ui.openMovie(featured.id)">
        <MoviePoster :movie="featured" large />
        <span class="feature-stub"><b>{{ featured.match }}%</b><span>match</span></span>
      </div>
      <div class="feature-text">
        <div class="slug-row r1">
          <button v-if="featurePool.length > 1" class="btn btn-sm btn-shuffle" title="Show a different feature" @click="shuffleFeature">
            <Icon name="refresh" :size="15" /> Another pick
          </button>
          <p class="slug">{{ slug }}</p>
        </div>
        <p class="kicker r2">Tonight’s feature for {{ auth.firstName }}</p>
        <h1 class="r3">{{ featured.title }}</h1>
        <p class="facts r4">
          <span>{{ featured.year }}</span><span>★ {{ stars(featured.rating) }}</span><span>{{ featured.genres.slice(0, 3).join(' / ') }}</span>
        </p>
        <blockquote class="why r5">
          <span class="q" aria-hidden="true">“</span>
          <span><b class="label">Why you’ll like it</b>{{ featured.reason?.text }}.</span>
        </blockquote>
        <p v-if="featured.overview" class="overview r5">{{ featured.overview }}</p>
        <div class="hero-actions r6">
          <button class="btn btn-lg" :class="{ 'btn-primary': featuredState.inWatchlist }" :aria-pressed="!!featuredState.inWatchlist" @click="ui.toggleWatchlist(featured)">
            <Icon :name="featuredState.inWatchlist ? 'check' : 'plus'" :size="18" />
            {{ featuredState.inWatchlist ? 'In your watchlist' : 'Add to watchlist' }}
          </button>
          <button v-if="featuredTrailer" class="btn btn-primary btn-lg btn-trailer" @click="ui.openMovie(featured.id, { playTrailer: true })">
            <span class="tri" aria-hidden="true" /> Play trailer
          </button>
          <button class="btn btn-lg" @click="ui.openMovie(featured.id, { showProviders: true })"><Icon name="film" :size="18" /> Where to watch</button>
          <button class="btn btn-lg" @click="ui.openMovie(featured.id)">More info</button>
        </div>
      </div>
    </section>
    <section v-else-if="loading" class="container hero-skel"><div class="skeleton" style="height: 100%" /></section>

    <!-- Mood switcher -->
    <section class="moods">
      <div class="filmstrip" aria-hidden="true" />
      <div class="container mood-inner">
        <h2>In the mood for <span class="serif-italic">something…</span></h2>
        <div class="mood-chips">
          <button v-for="(info, key) in MOOD_INFO" :key="key" class="chip" :class="{ selected: mood === key }" :aria-pressed="mood === key" @click="pickFilter('mood', key)">
            <span aria-hidden="true">{{ info.glyph }}</span>{{ info.label }}
          </button>
        </div>
      </div>
      <div class="container filter-inner">
        <div class="filter-group" role="group" aria-label="Released">
          <span class="filter-label">Released</span>
          <button v-for="(info, key) in ERA_INFO" :key="key" class="chip" :class="{ selected: era === key }" :aria-pressed="era === key" :title="info.range" @click="pickFilter('era', key)">
            {{ info.label }}
          </button>
        </div>
        <div class="filter-group" role="group" aria-label="Rating">
          <span class="filter-label">Rating</span>
          <button v-for="(info, key) in QUALITY_INFO" :key="key" class="chip" :class="{ selected: quality === key }" :aria-pressed="quality === key" @click="pickFilter('quality', key)">
            <span aria-hidden="true">{{ info.glyph }}</span>{{ info.label }}
          </button>
        </div>
      </div>
      <div class="filmstrip" aria-hidden="true" />
    </section>

    <section v-if="anyFilter" class="container mood-results">
      <header class="mood-head">
        <h2>{{ filterTitle }} <span class="serif-italic">picks for you</span></h2>
        <button class="btn btn-sm" @click="clearFilters"><Icon name="x" :size="16" /> Clear</button>
      </header>
      <div class="grid">
        <MovieCard v-for="m in moodItems" :key="m.id" :movie="m" />
        <template v-if="moodLoading"><div v-for="n in 6" :key="'s' + n" class="skeleton" style="aspect-ratio: 2/3" /></template>
      </div>
      <p v-if="!moodLoading && !moodItems.length" class="empty">Nothing matches that combination yet. Try removing a filter.</p>
      <div v-if="!moodDone && moodItems.length && !moodLoading" class="more">
        <button class="btn" @click="loadMood">Show more</button>
      </div>
    </section>

    <!-- Programme rows -->
    <div v-if="error" class="container err card">
      <p>{{ error }}</p>
      <button class="btn btn-primary btn-sm" @click="load">Try again</button>
    </div>
    <template v-else-if="loading">
      <MovieRow v-for="n in 3" :key="n" :index="n" title="Loading…" loading />
    </template>
    <template v-else>
      <MovieRow v-for="(s, i) in sections" :key="s.id" :index="i + 1" :title="s.title" :movies="i === 0 ? s.items.filter((m) => m.id !== featured?.id) : s.items" :subtitle="i === 0 ? 'Ranked by our model for your taste — a thumbs-up or thumbs-down recuts the list.' : ''" />
    </template>
  </main>
</template>

<style scoped>
.home { padding-bottom: 70px; }
.feature { display: grid; grid-template-columns: minmax(220px, 330px) 1fr; gap: clamp(28px, 5vw, 72px); align-items: center; padding-top: 36px; padding-bottom: 56px; }
.feature-poster { position: relative; cursor: pointer; border: 2px solid var(--ink); border-radius: 3px; box-shadow: 12px 12px 0 var(--ink); transform: rotate(-2.5deg); transition: transform 0.4s var(--ease); animation: deal-in 0.8s var(--ease) both; }
.feature-poster:hover { transform: rotate(0deg) translateY(-4px); }
.feature-poster > :deep(.poster) { border-radius: 2px; }
@keyframes deal-in { from { opacity: 0; transform: translate(-60px, 30px) rotate(-12deg); } }
.feature-stub {
  position: absolute; right: -26px; bottom: 28px; display: grid; justify-items: center; padding: 10px 14px 10px 20px;
  background: var(--mustard); border: 2px solid var(--ink); transform: rotate(8deg); box-shadow: 4px 4px 0 var(--ink);
  -webkit-mask: radial-gradient(circle 6px at 0 50%, transparent 97%, #000); mask: radial-gradient(circle 6px at 0 50%, transparent 97%, #000);
}
.feature-stub b { font: 900 38px/1 var(--display); }
.feature-stub span { font: 700 11px var(--mono); text-transform: uppercase; letter-spacing: 0.14em; }
.feature-text { display: grid; gap: 16px; }
.feature-text > * { animation: fade-up 0.7s var(--ease) both; }
.r1 { animation-delay: 0.15s !important; } .r2 { animation-delay: 0.25s !important; } .r3 { animation-delay: 0.35s !important; }
.r4 { animation-delay: 0.45s !important; } .r5 { animation-delay: 0.55s !important; } .r6 { animation-delay: 0.65s !important; }
.slug { font: 700 12.5px var(--mono); text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-3); }
.kicker { font: 700 13px var(--mono); text-transform: uppercase; letter-spacing: 0.14em; color: var(--red-deep); }
h1 { font-size: clamp(56px, 8.5vw, 132px); font-weight: 900; line-height: 0.86; }
.facts { display: flex; flex-wrap: wrap; gap: 8px; }
.facts span { padding: 5px 10px; border: 2px solid var(--ink); font: 700 12.5px var(--mono); text-transform: uppercase; letter-spacing: 0.06em; background: var(--card); }
.why { position: relative; margin: 6px 0 0; padding: 4px 0 0 52px; font: italic 400 clamp(20px, 2vw, 25px)/1.35 var(--serif); max-width: 34ch; }
.why .q { position: absolute; left: 0; top: -14px; font: 900 96px/1 var(--display); color: var(--red); }
.why .label { display: block; font-style: normal; margin-bottom: 2px; }
.overview { color: var(--ink-2); max-width: 60ch; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 6px; }
.btn-trailer { animation: fade-up 0.35s var(--ease) both; }
/* a printed "play" triangle */
.tri { width: 0; height: 0; border-style: solid; border-width: 7px 0 7px 12px; border-color: transparent transparent transparent currentColor; }
.slug-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-start; gap: 10px 16px; }
.btn-shuffle { flex-shrink: 0; }
.btn-shuffle :deep(svg) { transition: transform 0.4s var(--ease); }
.btn-shuffle:hover :deep(svg) { transform: rotate(180deg); }
.hero-skel { height: 460px; padding-top: 30px; padding-bottom: 40px; }

.moods { margin: 10px 0 52px; background: var(--ink); color: var(--paper); }
.mood-inner { padding-top: 22px; padding-bottom: 24px; display: flex; flex-wrap: wrap; align-items: center; gap: 18px 28px; }
.moods h2 { font-size: clamp(28px, 3vw, 40px); color: var(--paper); }
.moods h2 .serif-italic { color: var(--mustard); }
.mood-chips { display: flex; gap: 10px; overflow-x: auto; padding: 4px 2px; scrollbar-width: none; flex: 1; }
.mood-chips .chip { flex-shrink: 0; border-color: var(--paper); }
.mood-chips .chip:not(.selected) { background: var(--paper); }
.filter-inner { padding-bottom: 22px; display: flex; flex-wrap: wrap; gap: 14px 36px; }
.filter-group { display: flex; align-items: center; gap: 10px; overflow-x: auto; padding: 4px 2px; scrollbar-width: none; }
.filter-label { flex-shrink: 0; font: 700 12px var(--mono); text-transform: uppercase; letter-spacing: 0.14em; color: var(--mustard); }
.filter-group .chip { flex-shrink: 0; border-color: var(--paper); }
.filter-group .chip:not(.selected) { background: var(--paper); }
.empty { font: italic 400 20px var(--serif); color: var(--ink-2); }
.mood-results { margin-bottom: 56px; animation: fade-up 0.4s var(--ease); }
.mood-head { display: flex; justify-content: space-between; align-items: end; margin-bottom: 22px; gap: 12px; }
.mood-head h2 { font-size: clamp(32px, 4vw, 52px); }
.mood-head .serif-italic { color: var(--red); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 30px 22px; }
.more { display: flex; justify-content: center; margin-top: 32px; }
.err { padding: 24px; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
@media (max-width: 760px) {
  .feature { grid-template-columns: 1fr; padding-top: 20px; }
  .feature-poster { width: 150px; }
  .feature-stub { right: -40px; bottom: 16px; padding: 6px 10px 6px 16px; }
  .feature-stub b { font-size: 26px; }
  .grid { grid-template-columns: repeat(auto-fill, minmax(135px, 1fr)); }
  /* feature buttons: one tidy column of equal-width buttons */
  .hero-actions { flex-direction: column; gap: 12px; }
  .hero-actions .btn { width: 100%; height: 52px; }
}
</style>
