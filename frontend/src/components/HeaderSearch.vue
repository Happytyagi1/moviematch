<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Movies } from '../api.js';
import { useAuth } from '../stores/auth.js';
import { useUi } from '../stores/ui.js';
import { posterInks, stars } from '../utils/movie.js';
import Icon from './Icon.vue';

// The "Search the archive…" box in both headers (signed in and guest).
// Typing shows matching titles; an empty, focused box shows suggestions:
// personal picks when signed in, popular films for guests.
const auth = useAuth();
const ui = useUi();
const router = useRouter();
const route = useRoute();
const q = ref(typeof route.query.q === 'string' ? route.query.q : '');

const SUGGEST_LIMIT = 6;
const open = ref(false);
const active = ref(-1);
const matches = ref([]);
const picks = ref(null); // suggestions for the empty box, fetched on first focus
const picksFor = ref(null); // whose suggestions they are (re-fetch after signing in)
const suggestLoading = ref(false);
let timer;
let ctl;
onBeforeUnmount(() => { clearTimeout(timer); ctl?.abort(); });

const term = computed(() => q.value.trim());
const items = computed(() => (term.value ? matches.value : picks.value || []));
const heading = computed(() => (term.value ? 'From the archive' : auth.isAuthed ? 'Recommended for you' : 'Popular right now'));
// The last row ("See all results") is keyboard-selectable too.
const rowCount = computed(() => items.value.length + (term.value ? 1 : 0));

async function loadPicks() {
  const who = auth.user?.id || 'guest';
  if (picks.value && picksFor.value === who) return;
  picksFor.value = who;
  try {
    picks.value = auth.isAuthed
      ? (await Movies.recommendations({ limit: SUGGEST_LIMIT })).items
      : ((await Movies.browse()).sections[0]?.items || []).slice(0, SUGGEST_LIMIT);
  } catch {
    picks.value = [];
  }
}

watch(term, (t) => {
  active.value = -1;
  clearTimeout(timer);
  ctl?.abort();
  if (!t) { matches.value = []; suggestLoading.value = false; return; }
  suggestLoading.value = true;
  timer = setTimeout(async () => {
    ctl = new AbortController();
    try {
      matches.value = (await Movies.search(t, ctl.signal)).movies.slice(0, SUGGEST_LIMIT);
      suggestLoading.value = false;
    } catch (e) {
      if (e.name !== 'AbortError') { matches.value = []; suggestLoading.value = false; }
    }
  }, 180);
});

function onFocus() {
  open.value = true;
  loadPicks();
}
function close() {
  open.value = false;
  active.value = -1;
}
function move(step) {
  if (!open.value) { onFocus(); return; }
  if (!rowCount.value) return;
  // Cycle through -1 (the input itself) .. rowCount-1.
  let next = active.value + step;
  if (next >= rowCount.value) next = -1;
  else if (next < -1) next = rowCount.value - 1;
  active.value = next;
}
function pick(m) {
  close();
  document.getElementById('global-search')?.blur();
  ui.openMovie(m.id);
}
function search() {
  if (open.value && active.value >= 0 && active.value < items.value.length) return pick(items.value[active.value]);
  const t = term.value;
  close();
  if (t) router.push({ name: 'search', query: { q: t } });
}
</script>

<template>
  <div class="search-wrap" @focusout="(e) => !e.currentTarget.contains(e.relatedTarget) && close()">
    <form class="search" role="search" @submit.prevent="search">
      <Icon name="search" :size="18" />
      <label for="global-search" class="sr-only">Search movies</label>
      <input
        id="global-search" v-model="q" type="search" placeholder="Search the archive…" autocomplete="off"
        role="combobox" aria-autocomplete="list" aria-controls="search-suggest" :aria-expanded="open && (rowCount > 0 || suggestLoading)"
        :aria-activedescendant="active >= 0 ? `suggest-${active}` : undefined"
        @focus="onFocus" @click="onFocus"
        @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.esc="close"
      />
    </form>
    <div v-if="open && (rowCount > 0 || suggestLoading || term)" id="search-suggest" class="suggest" role="listbox" :aria-label="heading">
      <p class="suggest-head">{{ heading }}</p>
      <template v-if="suggestLoading && !items.length">
        <div v-for="n in 3" :key="n" class="skeleton suggest-skel" />
      </template>
      <p v-else-if="term && !items.length" class="suggest-empty">No titles match “{{ term }}”.</p>
      <button
        v-for="(m, i) in items" :id="`suggest-${i}`" :key="m.id" type="button" role="option" tabindex="-1"
        class="suggest-item" :class="{ active: active === i }" :aria-selected="active === i"
        @mousedown.prevent @mouseenter="active = i" @click="pick(m)"
      >
        <span class="thumb" :style="{ background: posterInks(m.id).bg, color: posterInks(m.id).fg }">
          <img v-if="m.poster" :src="m.poster" alt="" loading="lazy" />
          <template v-else>{{ m.title.charAt(0) }}</template>
        </span>
        <span class="s-text">
          <b>{{ m.title }}</b>
          <small>{{ m.year }} · ★ {{ stars(m.rating) }} · {{ m.genres.slice(0, 2).join(' / ') }}</small>
        </span>
        <span v-if="m.match" class="s-match">{{ m.match }}%</span>
      </button>
      <button
        v-if="term" :id="`suggest-${items.length}`" type="button" role="option" tabindex="-1"
        class="suggest-all" :class="{ active: active === items.length }" :aria-selected="active === items.length"
        @mousedown.prevent @mouseenter="active = items.length" @click="active = -1; search()"
      >
        See all results for “{{ term }}” <Icon name="right" :size="15" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.search-wrap { position: relative; margin-left: auto; }
.suggest {
  position: absolute; top: calc(100% + 10px); left: 0; right: 0; min-width: 320px; z-index: 60; padding: 8px; display: grid; gap: 2px;
  background: var(--card); border: 2px solid var(--ink); border-radius: 3px; box-shadow: var(--hard-lg); animation: fade-up 0.18s var(--ease);
}
.suggest-head { padding: 4px 8px 8px; font: 700 11px var(--mono); text-transform: uppercase; letter-spacing: 0.14em; color: var(--red-deep); border-bottom: 2px dashed var(--rule-strong); margin-bottom: 4px; }
.suggest-item { display: flex; align-items: center; gap: 12px; padding: 7px 8px; border: 0; border-radius: 2px; background: none; text-align: left; cursor: pointer; }
.suggest-item.active, .suggest-all.active { background: var(--mustard); }
.thumb { flex-shrink: 0; width: 34px; height: 50px; display: grid; place-items: center; overflow: hidden; border: 1.5px solid var(--ink); font: 900 20px/1 var(--display); }
.thumb img { width: 100%; height: 100%; object-fit: cover; }
.s-text { flex: 1; min-width: 0; display: grid; gap: 2px; }
.s-text b { font: 800 18px/1.05 var(--display); text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.s-text small { font: 400 11.5px var(--mono); color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.s-match { flex-shrink: 0; padding: 3px 7px; border: 1.5px solid var(--ink); font: 700 12px var(--mono); }
.suggest-all { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px; padding: 10px 8px; border: 0; border-top: 2px dashed var(--rule-strong); background: none; font: 700 12px var(--mono); text-transform: uppercase; letter-spacing: 0.06em; text-align: left; cursor: pointer; }
.suggest-empty { padding: 10px 8px; font: italic 400 16px var(--serif); color: var(--ink-2); }
.suggest-skel { height: 50px; margin: 4px 0; }
.search {
  display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 14px; width: min(340px, 34vw);
  border-radius: 3px; background: var(--card); border: 2px solid var(--ink); color: var(--ink-3); transition: box-shadow 0.15s;
}
.search:focus-within { box-shadow: 4px 4px 0 var(--red); color: var(--ink); }
.search input { flex: 1; min-width: 0; background: none; border: 0; outline: none; font: 400 16px var(--serif); }
.search input::placeholder { font-style: italic; color: var(--ink-3); }
@media (max-width: 760px) {
  .search-wrap { flex: 1; min-width: 0; }
  .search { width: auto; }
  .suggest { position: fixed; top: calc(var(--header-h) - 4px); left: 12px; right: 12px; min-width: 0; }
}
</style>
