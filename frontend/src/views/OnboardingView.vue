<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../stores/auth.js';
import { useUi } from '../stores/ui.js';
import { Movies } from '../api.js';
import AppLogo from '../components/AppLogo.vue';
import Icon from '../components/Icon.vue';
import MoviePoster from '../components/MoviePoster.vue';
import { AUDIENCE_INFO, DISCOVERY_INFO, ERA_INFO, MOOD_INFO, pad2 } from '../utils/movie.js';

const auth = useAuth();
const ui = useUi();
const router = useRouter();

const STEPS = ['genres', 'avoid', 'favorites', 'moods', 'eras', 'style', 'building'];
const step = ref(0);
const direction = ref('slide');
const options = ref({ genres: [], moods: [], eras: [], discovery: [], audience: [] });
const existing = auth.user?.preferences || {};
const answers = reactive({
  genres: [...(existing.genres || [])],
  avoidGenres: [...(existing.avoidGenres || [])],
  favoriteMovies: [...(existing.favoriteMovies || [])],
  moods: [...(existing.moods || [])],
  eras: [...(existing.eras || [])],
  discovery: existing.discovery || 'balanced',
  audience: existing.audience || 'solo',
});

const SEED_PAGE = 60;
// Infinite scroll: a sentinel under the grid loads the next page when it comes into view.
const seedSentinel = ref(null);
let seedObserver;
watch(seedSentinel, (el) => {
  seedObserver?.disconnect();
  if (!el || typeof IntersectionObserver === 'undefined') return;
  seedObserver = new IntersectionObserver(
    ([entry]) => { if (entry.isIntersecting && !seedsLoading.value && !seedsDone.value && seeds.value.length) loadSeeds(); },
    { rootMargin: '600px 0px' },
  );
  seedObserver.observe(el);
});
onBeforeUnmount(() => seedObserver?.disconnect());
const seeds = ref([]);
const seedsLoading = ref(false);
const seedsDone = ref(false);
const query = ref('');
const results = ref([]);
const picked = reactive(new Map()); // id -> movie, for showing posters of picks
const error = ref('');

// Example posters for the mood / era / discovery cards (decorative; the quiz works without them).
const previews = ref({ moods: {}, eras: {}, discovery: {} });
onMounted(() => {
  Movies.previews?.().then((p) => { previews.value = p; }).catch(() => {});
});

onMounted(async () => {
  options.value = await Movies.options();
  if (answers.favoriteMovies.length) {
    const { movies } = await Movies.favorites().catch(() => ({ movies: [] }));
    movies.forEach((m) => picked.set(m.id, m));
  }
});

const toggle = (list, value) => {
  const i = list.indexOf(value);
  if (i === -1) list.push(value);
  else list.splice(i, 1);
};
/** "Select all" ↔ "Clear all" for a multi-choice step. */
const allSelected = (list, all) => all.length > 0 && all.every((v) => list.includes(v));
function toggleAll(list, all) {
  const fill = !allSelected(list, all);
  list.splice(0, list.length, ...(fill ? all : []));
}
function toggleMovie(m) {
  toggle(answers.favoriteMovies, m.id);
  if (picked.has(m.id)) picked.delete(m.id);
  else picked.set(m.id, m);
}

async function loadSeeds() {
  seedsLoading.value = true;
  try {
    const { movies } = await Movies.seeds(answers.genres, { limit: SEED_PAGE, offset: seeds.value.length });
    const have = new Set(seeds.value.map((m) => m.id));
    seeds.value.push(...movies.filter((m) => !have.has(m.id)));
    seedsDone.value = movies.length < SEED_PAGE;
  } catch (e) {
    ui.toast(e.message, 'error');
  } finally {
    seedsLoading.value = false;
  }
}

let searchCtl;
let searchTimer;
watch(query, (q) => {
  clearTimeout(searchTimer);
  searchCtl?.abort();
  if (q.trim().length < 2) { results.value = []; return; }
  searchTimer = setTimeout(async () => {
    searchCtl = new AbortController();
    try {
      results.value = (await Movies.search(q.trim(), searchCtl.signal, 60)).movies;
      suggestActive.value = -1;
    } catch (e) {
      if (e.name !== 'AbortError') results.value = [];
    }
  }, 220); // debounce
});

const grid = computed(() => (query.value.trim().length >= 2 ? results.value : seeds.value));

/* ------------------------------------------- search-box suggestions dropdown
 * Empty box: films like your latest pick (or popular in your genres before any pick).
 * Typing: live matches from the whole archive. Clicking casts/uncasts and keeps it open,
 * so you can pick several in a row. */
const SUGGEST_LIMIT = 8;
const suggestOpen = ref(false);
const suggestActive = ref(-1);
const similarCache = reactive(new Map()); // movieId -> similar movies
const lastPickId = computed(() => answers.favoriteMovies[answers.favoriteMovies.length - 1]);
const searching = computed(() => query.value.trim().length >= 2);

const suggestions = computed(() => {
  if (searching.value) return results.value.slice(0, SUGGEST_LIMIT);
  const notPicked = (list) => list.filter((m) => !answers.favoriteMovies.includes(m.id));
  const similar = similarCache.get(lastPickId.value);
  if (similar?.length) return notPicked(similar).slice(0, SUGGEST_LIMIT);
  return notPicked(seeds.value).slice(0, SUGGEST_LIMIT);
});
const suggestHeading = computed(() => {
  if (searching.value) return 'Matches in the archive';
  if (similarCache.get(lastPickId.value)?.length) return `Because you cast ${picked.get(lastPickId.value)?.title || 'your last pick'}`;
  return answers.genres.length ? 'Popular in your genres' : 'Popular picks';
});

async function loadSimilar(id) {
  if (id == null || similarCache.has(id)) return;
  similarCache.set(id, []); // mark in-flight
  try {
    const { similar } = await Movies.details(id);
    similarCache.set(id, similar || []);
  } catch {
    similarCache.delete(id);
  }
}
watch([suggestOpen, lastPickId], ([isOpen, id]) => { if (isOpen) loadSimilar(id); });

function openSuggest() {
  suggestOpen.value = true;
  if (!seeds.value.length && !seedsLoading.value) loadSeeds();
}
function closeSuggest() {
  suggestOpen.value = false;
  suggestActive.value = -1;
}
function moveSuggest(stepBy) {
  if (!suggestOpen.value) return openSuggest();
  const n = suggestions.value.length;
  if (!n) return;
  let next = suggestActive.value + stepBy;
  if (next >= n) next = -1;
  else if (next < -1) next = n - 1;
  suggestActive.value = next;
}
function chooseSuggestion(m) {
  toggleMovie(m);
  // Recommendation lists shrink as you pick, so keep the highlight in range.
  if (suggestActive.value >= suggestions.value.length) suggestActive.value = suggestions.value.length - 1;
}
function onSuggestEnter() {
  const m = suggestions.value[suggestActive.value];
  if (suggestOpen.value && m) chooseSuggestion(m);
}
const avoidable = computed(() => options.value.genres.filter((g) => !answers.genres.includes(g)));

// The "avoid" step has nothing to offer when every genre was picked as a favourite.
const shouldSkip = (i) => STEPS[i] === 'avoid' && avoidable.value.length === 0;

const canNext = computed(() => {
  const s = STEPS[step.value];
  if (s === 'genres') return answers.genres.length >= 1;
  if (s === 'favorites') return answers.favoriteMovies.length >= 3;
  return true;
});
const progress = computed(() => Math.round((step.value / (STEPS.length - 1)) * 100));

async function next() {
  if (!canNext.value) return;
  direction.value = 'slide';
  if (STEPS[step.value] === 'genres') answers.avoidGenres = answers.avoidGenres.filter((g) => !answers.genres.includes(g));
  step.value++;
  if (shouldSkip(step.value)) step.value++;
  if (STEPS[step.value] === 'favorites' && !seeds.value.length) loadSeeds();
  if (STEPS[step.value] === 'building') await finish();
}
function back() {
  if (step.value === 0) return;
  direction.value = 'slide-back';
  step.value--;
  if (shouldSkip(step.value)) step.value--;
}

async function finish() {
  error.value = '';
  const started = Date.now();
  try {
    await auth.savePreferences({ ...answers });
    // let the 3-2-1 film-leader countdown finish — perceived quality matters
    await new Promise((r) => setTimeout(r, Math.max(0, 3200 - (Date.now() - started))));
    router.replace('/home');
  } catch (e) {
    error.value = e.message;
  }
}

watch(
  () => answers.genres.join(),
  () => { seeds.value = []; seedsDone.value = false; },
);
</script>

<template>
  <main class="onboarding">
    <header class="container top">
      <AppLogo />
      <div class="frames" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100" aria-label="Quiz progress">
        <span v-for="n in STEPS.length - 1" :key="n" class="frame" :class="{ done: n <= step, now: n === step + 1 }" />
      </div>
      <span class="step-count">Scene {{ pad2(Math.min(step + 1, STEPS.length - 1)) }} / {{ pad2(STEPS.length - 1) }}</span>
    </header>

    <div class="container stage">
      <Transition :name="direction" mode="out-in">
        <!-- 1. Genres -->
        <section v-if="STEPS[step] === 'genres'" key="genres" class="step">
          <p class="kicker">Screen test · Hi {{ auth.firstName }}</p>
          <h1>Which genres do you <span class="hl">love</span>?</h1>
          <div class="hint-row">
            <p class="hint-text">Pick as many as you like — three or more works best.</p>
            <button type="button" class="btn btn-sm select-all" :aria-pressed="allSelected(answers.genres, options.genres)" @click="toggleAll(answers.genres, options.genres)">
              <Icon :name="allSelected(answers.genres, options.genres) ? 'x' : 'check'" :size="15" />
              {{ allSelected(answers.genres, options.genres) ? 'Clear all' : 'Select all' }}
            </button>
          </div>
          <div class="chips">
            <button v-for="g in options.genres" :key="g" class="chip" :class="{ selected: answers.genres.includes(g) }" :aria-pressed="answers.genres.includes(g)" @click="toggle(answers.genres, g)">{{ g }}</button>
          </div>
        </section>

        <!-- 2. Avoid -->
        <section v-else-if="STEPS[step] === 'avoid'" key="avoid" class="step">
          <p class="kicker">Optional · Cut from the programme</p>
          <h1>Anything you’d rather <span class="hl">skip</span>?</h1>
          <p class="hint-text">We’ll never recommend these. Skip this step if you’re open to everything.</p>
          <div class="chips">
            <button v-for="g in avoidable" :key="g" class="chip avoid" :class="{ selected: answers.avoidGenres.includes(g) }" :aria-pressed="answers.avoidGenres.includes(g)" @click="toggle(answers.avoidGenres, g)">{{ g }}</button>
          </div>
        </section>

        <!-- 3. Favourite movies -->
        <section v-else-if="STEPS[step] === 'favorites'" key="favorites" class="step wide">
          <p class="kicker">The most important question</p>
          <h1>Cast at least <span class="hl">three</span> films you love</h1>
          <p class="hint-text">These teach our model your taste better than anything else.</p>

          <div class="fav-bar">
            <div class="search-wrap" @focusout="(e) => !e.currentTarget.contains(e.relatedTarget) && closeSuggest()">
              <div class="search-box">
                <Icon name="search" :size="18" />
                <label for="fav-search" class="sr-only">Search for a movie</label>
                <input
                  id="fav-search" v-model="query" type="search" placeholder="Search any film you love…" autocomplete="off"
                  role="combobox" aria-autocomplete="list" aria-controls="fav-suggest" :aria-expanded="suggestOpen"
                  :aria-activedescendant="suggestActive >= 0 ? `fav-suggest-${suggestActive}` : undefined"
                  @focus="openSuggest" @click="openSuggest" @input="suggestOpen = true"
                  @keydown.down.prevent="moveSuggest(1)" @keydown.up.prevent="moveSuggest(-1)"
                  @keydown.enter.prevent="onSuggestEnter" @keydown.esc="closeSuggest"
                />
              </div>
              <div v-if="suggestOpen" id="fav-suggest" class="suggest" role="listbox" :aria-label="suggestHeading" aria-multiselectable="true">
                <p class="suggest-head">{{ suggestHeading }}</p>
                <template v-if="!suggestions.length">
                  <p v-if="searching" class="suggest-empty">No titles match “{{ query.trim() }}”.</p>
                  <template v-else><div v-for="n in 3" :key="n" class="skeleton suggest-skel" /></template>
                </template>
                <button
                  v-for="(m, i) in suggestions" :id="`fav-suggest-${i}`" :key="m.id" type="button" role="option" tabindex="-1"
                  class="suggest-item" :class="{ active: suggestActive === i, on: answers.favoriteMovies.includes(m.id) }"
                  :aria-selected="answers.favoriteMovies.includes(m.id)"
                  @mousedown.prevent @mouseenter="suggestActive = i" @click="chooseSuggestion(m)"
                >
                  <span class="s-thumb"><MoviePoster :movie="m" bare /></span>
                  <span class="s-text"><b>{{ m.title }}</b><small>{{ m.year }} · {{ m.genres.slice(0, 2).join(' / ') }}</small></span>
                  <span class="s-cast"><Icon :name="answers.favoriteMovies.includes(m.id) ? 'check' : 'plus'" :size="15" />{{ answers.favoriteMovies.includes(m.id) ? 'Cast' : 'Add' }}</span>
                </button>
                <p v-if="searching && results.length > SUGGEST_LIMIT" class="suggest-more">{{ results.length - SUGGEST_LIMIT }} more below ↓</p>
              </div>
            </div>
            <div class="picked" aria-live="polite">
              <div v-for="id in answers.favoriteMovies.slice(-6)" :key="id" class="mini" :title="picked.get(id)?.title">
                <MoviePoster v-if="picked.get(id)" :movie="picked.get(id)" bare />
              </div>
              <span class="count" :class="{ done: answers.favoriteMovies.length >= 3 }">{{ answers.favoriteMovies.length }} picked</span>
            </div>
          </div>

          <div class="seed-grid">
            <template v-if="seedsLoading && !grid.length">
              <div v-for="n in 12" :key="n" class="skeleton" style="aspect-ratio: 2/3" />
            </template>
            <button v-for="(m, i) in grid" :key="m.id" class="seed" :class="{ on: answers.favoriteMovies.includes(m.id) }" :style="{ animationDelay: `${Math.min(i, 18) * 0.03}s` }" :aria-pressed="answers.favoriteMovies.includes(m.id)" :aria-label="`${m.title} (${m.year})`" @click="toggleMovie(m)">
              <MoviePoster :movie="m" bare />
              <span class="stamp" aria-hidden="true">Cast!</span>
              <span class="seed-title">{{ m.title }} <em>{{ m.year }}</em></span>
            </button>
            <p v-if="query.trim().length >= 2 && !results.length" class="empty">No matches for “{{ query }}”. Try another title.</p>
          </div>
          <template v-if="!searching && seeds.length">
            <div v-if="seedsLoading" class="seed-grid more-skel">
              <div v-for="n in 6" :key="n" class="skeleton" style="aspect-ratio: 2/3" />
            </div>
            <div v-if="!seedsDone" ref="seedSentinel" class="more">
              <button type="button" class="btn" :disabled="seedsLoading" @click="loadSeeds">{{ seedsLoading ? 'Loading…' : 'Show more films' }}</button>
            </div>
            <p v-else class="more end-note">That’s the whole reel for your genres. Search above for anything else.</p>
          </template>
        </section>

        <!-- 4. Moods -->
        <section v-else-if="STEPS[step] === 'moods'" key="moods" class="step">
          <p class="kicker">Vibe check</p>
          <h1>What do you usually feel like <span class="hl">watching</span>?</h1>
          <div class="hint-row">
            <p class="hint-text">Choose any that apply.</p>
            <button type="button" class="btn btn-sm select-all" :aria-pressed="allSelected(answers.moods, options.moods)" @click="toggleAll(answers.moods, options.moods)">
              <Icon :name="allSelected(answers.moods, options.moods) ? 'x' : 'check'" :size="15" />
              {{ allSelected(answers.moods, options.moods) ? 'Clear all' : 'Select all' }}
            </button>
          </div>
          <div class="cards">
            <button v-for="(m, i) in options.moods" :key="m" class="index-card" :class="{ selected: answers.moods.includes(m) }" :aria-pressed="answers.moods.includes(m)" @click="toggle(answers.moods, m)">
              <span class="ic-num">{{ pad2(i + 1) }}</span>
              <span class="ic-glyph" aria-hidden="true">{{ MOOD_INFO[m].glyph }}</span>
              <b>{{ MOOD_INFO[m].label }}</b>
              <span class="ic-hint">{{ MOOD_INFO[m].hint }}</span>
              <span class="ic-reel" aria-hidden="true">
                <span v-for="(p, k) in previews.moods[m] || []" :key="p.id" class="ic-poster" :style="{ '--k': k }" :title="p.title"><MoviePoster :movie="p" bare /></span>
              </span>
            </button>
          </div>
        </section>

        <!-- 5. Eras -->
        <section v-else-if="STEPS[step] === 'eras'" key="eras" class="step">
          <p class="kicker">Time travel</p>
          <h1>Any favourite <span class="hl">eras</span>?</h1>
          <div class="hint-row">
            <p class="hint-text">Leave empty if you don’t mind.</p>
            <button type="button" class="btn btn-sm select-all" :aria-pressed="allSelected(answers.eras, options.eras)" @click="toggleAll(answers.eras, options.eras)">
              <Icon :name="allSelected(answers.eras, options.eras) ? 'x' : 'check'" :size="15" />
              {{ allSelected(answers.eras, options.eras) ? 'Clear all' : 'Select all' }}
            </button>
          </div>
          <div class="cards four">
            <button v-for="e in options.eras" :key="e" class="index-card era" :class="{ selected: answers.eras.includes(e) }" :aria-pressed="answers.eras.includes(e)" @click="toggle(answers.eras, e)">
              <span class="ic-big">{{ ERA_INFO[e].big }}</span>
              <b>{{ ERA_INFO[e].label }}</b>
              <span class="ic-hint">{{ ERA_INFO[e].range }}</span>
              <span class="ic-reel" aria-hidden="true">
                <span v-for="(p, k) in previews.eras[e] || []" :key="p.id" class="ic-poster" :style="{ '--k': k }" :title="p.title"><MoviePoster :movie="p" bare /></span>
              </span>
            </button>
          </div>
        </section>

        <!-- 6. Style -->
        <section v-else-if="STEPS[step] === 'style'" key="style" class="step">
          <p class="kicker">Last two</p>
          <h1>How <span class="hl">adventurous</span> are you?</h1>
          <div class="cards three" role="radiogroup" aria-label="Discovery preference">
            <button v-for="d in options.discovery" :key="d" class="index-card" role="radio" :aria-checked="answers.discovery === d" :class="{ selected: answers.discovery === d }" @click="answers.discovery = d">
              <span class="ic-big">{{ DISCOVERY_INFO[d].big }}</span>
              <b>{{ DISCOVERY_INFO[d].label }}</b>
              <span class="ic-hint">{{ DISCOVERY_INFO[d].hint }}</span>
              <span class="ic-reel" aria-hidden="true">
                <span v-for="(p, k) in previews.discovery[d] || []" :key="p.id" class="ic-poster" :style="{ '--k': k }" :title="p.title"><MoviePoster :movie="p" bare /></span>
              </span>
            </button>
          </div>
          <h2 class="h2">Who’s on the couch?</h2>
          <div class="chips" role="radiogroup" aria-label="Audience">
            <button v-for="a in options.audience" :key="a" class="chip" role="radio" :aria-checked="answers.audience === a" :class="{ selected: answers.audience === a }" @click="answers.audience = a">{{ AUDIENCE_INFO[a].label }}</button>
          </div>
        </section>

        <!-- 7. Building: film-leader countdown -->
        <section v-else key="building" class="step building">
          <template v-if="!error">
            <div class="leader" aria-hidden="true">
              <span class="sweep" />
              <span class="cross" />
              <span class="ring" />
              <span class="digits"><i>3</i><i>2</i><i>1</i></span>
            </div>
            <h1>Threading the projector…</h1>
            <p class="hint-text">Matching you against 3,650 films and 100,000 real ratings.</p>
          </template>
          <template v-else>
            <h1>The film snapped</h1>
            <p class="field-error">{{ error }}</p>
            <button class="btn btn-primary" @click="finish">Try again</button>
          </template>
        </section>
      </Transition>
    </div>

    <footer v-if="STEPS[step] !== 'building'" class="nav-bar">
      <div class="container nav-inner">
        <button class="btn btn-ghost" :style="{ visibility: step ? 'visible' : 'hidden' }" @click="back"><Icon name="left" :size="18" /> Back</button>
        <p v-if="!canNext" class="hint">
          {{ STEPS[step] === 'favorites' ? `Pick ${3 - answers.favoriteMovies.length} more` : 'Pick at least one' }}
        </p>
        <button class="btn btn-primary" :disabled="!canNext" @click="next">
          {{ STEPS[step] === 'style' ? 'Show my movies' : STEPS[step] === 'avoid' && !answers.avoidGenres.length ? 'Skip' : 'Continue' }}
          <Icon name="right" :size="18" />
        </button>
      </div>
    </footer>
  </main>
</template>

<style scoped>
.onboarding { min-height: 100vh; display: flex; flex-direction: column; }
.top { display: flex; align-items: center; gap: 24px; height: 84px; }
.frames { margin-left: auto; display: flex; gap: 0; padding: 6px 4px; background: var(--ink); border-radius: 2px;
  background-image: radial-gradient(circle, var(--paper) 1.6px, transparent 2px), radial-gradient(circle, var(--paper) 1.6px, transparent 2px);
  background-size: 10px 6px; background-position: 0 0, 0 100%; background-repeat: repeat-x; }
.frame { width: clamp(22px, 5vw, 54px); height: 26px; margin: 0 2px; background: #3a332a; transition: background 0.35s var(--ease); }
.frame.done { background: var(--red); }
.frame.now { background: var(--mustard); }
.step-count { font: 700 12.5px var(--mono); text-transform: uppercase; letter-spacing: 0.12em; white-space: nowrap; }
.stage { flex: 1; padding-top: clamp(18px, 5vh, 56px); padding-bottom: 130px; }
.step { max-width: 900px; margin: 0 auto; }
.step.wide { max-width: 1160px; }
.kicker { font: 700 13px var(--mono); text-transform: uppercase; letter-spacing: 0.14em; color: var(--red-deep); margin-bottom: 12px; }
h1 { font-size: clamp(44px, 7vw, 92px); font-weight: 900; max-width: 15ch; }
.hl { color: var(--red); font-family: var(--serif); font-style: italic; font-weight: 600; text-transform: none; letter-spacing: -0.01em; }
.hint-text { margin-top: 14px; font: italic 400 19px var(--serif); color: var(--ink-2); }
.h2 { font-size: 34px; margin: 44px 0 0; }
.hint-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 20px; margin-top: 14px; }
.hint-row .hint-text { margin-top: 0; }
.select-all { flex-shrink: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 34px; }
.chips .chip { padding: 13px 22px; font-size: 14px; animation: fade-up 0.45s var(--ease) both; }

.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 18px; margin-top: 34px; }
.cards.four { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
.cards.three { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
/* ruled index cards */
.index-card {
  position: relative; display: grid; gap: 4px; justify-items: start; text-align: left; padding: 18px 18px 20px; min-height: 160px;
  border: 2px solid var(--ink); border-radius: 3px; box-shadow: 4px 4px 0 var(--ink);
  background: linear-gradient(var(--red) 0 0) 0 38px / 100% 1.5px no-repeat, repeating-linear-gradient(transparent 0 25px, rgba(29, 75, 90, 0.18) 25px 26px) 0 40px, var(--card);
  transition: transform 0.18s var(--ease), box-shadow 0.18s var(--ease), background-color 0.2s;
}
.index-card:hover { transform: translate(-2px, -3px) rotate(-1deg); box-shadow: 7px 7px 0 var(--ink); }
.index-card.selected { background-color: var(--mustard); background: linear-gradient(var(--ink) 0 0) 0 38px / 100% 1.5px no-repeat, var(--mustard); transform: rotate(-1.5deg); box-shadow: 6px 6px 0 var(--red); }
.ic-num { font: 700 12px var(--mono); color: var(--ink-3); }
.ic-glyph { position: absolute; right: 16px; top: 8px; font-size: 26px; color: var(--red); }
.index-card b { margin-top: 14px; font: 900 30px/0.95 var(--display); text-transform: uppercase; }
.ic-hint { font: italic 400 15px var(--serif); color: var(--ink-2); }
.ic-big { font: 900 48px/0.9 var(--display); color: var(--red); }
.index-card.selected .ic-big, .index-card.selected .ic-glyph { color: var(--ink); }
/* three example posters, fanned like cards in a hand; height reserved so nothing jumps on load */
.ic-reel { justify-self: stretch; display: flex; justify-content: center; align-items: flex-end; height: 104px; margin-top: 14px; padding-top: 6px; }
.ic-poster {
  width: 58px; margin: 0 -6px; border: 1.5px solid var(--ink); border-radius: 2px; overflow: hidden; background: var(--paper);
  box-shadow: 2px 2px 0 var(--ink); transform: rotate(calc((var(--k) - 1) * 7deg)) translateY(calc(var(--k) * (2 - var(--k)) * -6px));
  transition: transform 0.25s var(--ease); animation: poster-in 0.4s var(--ease) both; animation-delay: calc(var(--k) * 60ms);
}
@keyframes poster-in { from { opacity: 0; } }
.ic-poster:nth-child(2) { z-index: 1; }
.index-card:hover .ic-poster { transform: rotate(calc((var(--k) - 1) * 11deg)) translateY(calc(var(--k) * (2 - var(--k)) * -10px)); }

.fav-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; margin: 30px 0 24px; }
.search-box { flex: 1; min-width: 240px; max-width: 480px; display: flex; align-items: center; gap: 10px; height: 52px; padding: 0 16px; border: 2px solid var(--ink); border-radius: 3px; background: var(--card); color: var(--ink-3); box-shadow: 4px 4px 0 var(--ink); }
.search-box:focus-within { box-shadow: 4px 4px 0 var(--red); color: var(--ink); }
.search-box input { flex: 1; background: none; border: 0; outline: none; font: 400 17px var(--serif); }
.search-box input::placeholder { font-style: italic; }
.picked { display: flex; align-items: center; gap: 6px; }
.mini { width: 30px; border: 1.5px solid var(--ink); overflow: hidden; animation: drop-in 0.35s var(--ease); }
.count { margin-left: 8px; padding: 8px 14px; border: 2px solid var(--ink); font: 700 13px var(--mono); text-transform: uppercase; background: var(--card); }
.count.done { background: var(--ok); color: var(--paper); }
.seed-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 22px; }
.more { display: flex; justify-content: center; margin-top: 30px; }
.more-skel { margin-top: 22px; }
.end-note { font: italic 400 17px var(--serif); color: var(--ink-2); }
.search-wrap { position: relative; flex: 1; min-width: 240px; max-width: 520px; }
.search-wrap .search-box { max-width: none; }
.suggest {
  position: absolute; top: calc(100% + 12px); left: 0; right: 0; z-index: 20; max-height: min(460px, 60vh); overflow-y: auto; padding: 8px; display: grid; gap: 2px;
  background: var(--card); border: 2px solid var(--ink); border-radius: 3px; box-shadow: var(--hard-lg); animation: fade-up 0.18s var(--ease);
}
.suggest-head { padding: 4px 8px 8px; margin-bottom: 4px; font: 700 11px var(--mono); text-transform: uppercase; letter-spacing: 0.14em; color: var(--red-deep); border-bottom: 2px dashed var(--rule-strong); }
.suggest-item { display: flex; align-items: center; gap: 12px; padding: 6px 8px; border: 0; border-radius: 2px; background: none; text-align: left; cursor: pointer; }
.suggest-item.active { background: var(--mustard); }
.s-thumb { flex-shrink: 0; width: 36px; border: 1.5px solid var(--ink); overflow: hidden; }
.s-text { flex: 1; min-width: 0; display: grid; gap: 2px; }
.s-text b { font: 800 18px/1.05 var(--display); text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.s-text small { font: 400 11.5px var(--mono); color: var(--ink-3); }
.s-cast { flex-shrink: 0; display: flex; align-items: center; gap: 4px; padding: 4px 8px; border: 1.5px solid var(--ink); font: 700 11px var(--mono); text-transform: uppercase; }
.suggest-item.on .s-cast { background: var(--red); color: var(--paper); border-color: var(--red); }
.suggest-empty { padding: 10px 8px; font: italic 400 16px var(--serif); color: var(--ink-2); }
.suggest-more { padding: 8px; font: 700 11px var(--mono); text-transform: uppercase; color: var(--ink-3); text-align: center; }
.suggest-skel { height: 54px; margin: 4px 0; }
.seed { position: relative; padding: 0; border: 2px solid var(--ink); background: none; border-radius: 3px; overflow: hidden; box-shadow: 3px 3px 0 var(--ink); transition: transform 0.2s var(--ease), box-shadow 0.2s; animation: fade-up 0.45s var(--ease) both; text-align: left; }
.seed:hover { transform: translate(-2px, -3px); box-shadow: 6px 6px 0 var(--ink); }
.seed.on { box-shadow: 6px 6px 0 var(--red); transform: rotate(-1.5deg); }
.stamp {
  position: absolute; top: 34%; left: 50%; transform: translate(-50%, -50%) rotate(-14deg) scale(1.6); opacity: 0;
  padding: 4px 12px; border: 3px solid var(--red); color: var(--red); background: rgba(255, 248, 236, 0.85);
  font: 900 26px/1 var(--display); text-transform: uppercase; letter-spacing: 0.04em; transition: all 0.22s cubic-bezier(0.3, 1.6, 0.5, 1);
}
.seed.on .stamp { opacity: 1; transform: translate(-50%, -50%) rotate(-14deg) scale(1); }
.seed-title { position: absolute; left: 0; right: 0; bottom: 0; padding: 26px 10px 9px; color: #fff8ec; background: linear-gradient(transparent, rgba(22, 19, 15, 0.92)); font: 800 15px/1 var(--display); text-transform: uppercase; }
.seed-title em { font: 400 11px var(--mono); color: var(--mustard); font-style: normal; margin-left: 4px; }
.empty { grid-column: 1 / -1; padding: 30px; font: italic 18px var(--serif); text-align: center; }

.nav-bar { position: fixed; left: 0; right: 0; bottom: 0; padding: 16px 0; background: var(--paper); border-top: 2px solid var(--ink); z-index: 10; }
.nav-inner { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.hint { font: 700 12.5px var(--mono); text-transform: uppercase; letter-spacing: 0.1em; color: var(--red-deep); }

/* ---- film leader countdown ---- */
.building { padding-top: 4vh; display: grid; gap: 16px; justify-items: center; text-align: center; }
.building h1 { max-width: none; }
.leader { position: relative; width: min(300px, 70vw); aspect-ratio: 1; border-radius: 50%; overflow: hidden; background: #2a241d; border: 3px solid var(--ink); box-shadow: 10px 10px 0 var(--red); margin-bottom: 18px; }
.sweep { position: absolute; inset: 0; background: conic-gradient(from 0deg, rgba(233, 178, 60, 0.85) 0deg, rgba(233, 178, 60, 0.85) var(--a, 0deg), transparent var(--a, 0deg)); animation: sweep 1s linear 3 both; }
@property --a { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
@keyframes sweep { from { --a: 0deg; } to { --a: 360deg; } }
.cross { position: absolute; inset: 0; background: linear-gradient(var(--paper) 0 0) center / 2px 100% no-repeat, linear-gradient(var(--paper) 0 0) center / 100% 2px no-repeat; opacity: 0.7; }
.ring { position: absolute; inset: 14%; border-radius: 50%; border: 2px solid var(--paper); box-shadow: 0 0 0 22px transparent, inset 0 0 0 10px transparent; outline: 2px solid var(--paper); outline-offset: 14px; opacity: 0.8; }
.digits i { position: absolute; inset: 0; display: grid; place-items: center; font: 900 140px/1 var(--display); color: var(--paper); font-style: normal; opacity: 0; animation: flash 1s steps(1) both; }
.digits i:nth-child(1) { animation-delay: 0s; }
.digits i:nth-child(2) { animation-delay: 1s; }
.digits i:nth-child(3) { animation-delay: 2s; animation-fill-mode: forwards; animation-name: flash-last; }
@keyframes flash { 0% { opacity: 1; } 100% { opacity: 0; } }
@keyframes flash-last { 0%, 100% { opacity: 1; } }
@media (max-width: 640px) {
  .seed-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .picked .mini, .hint, .frames { display: none; }
  .step-count { margin-left: auto; }
}
</style>
