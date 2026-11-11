<script setup>
import { computed, onMounted, ref } from 'vue';
import { Movies } from '../api.js';
import { useUi } from '../stores/ui.js';
import MovieCard from '../components/MovieCard.vue';

const ui = useUi();
const lib = ref({ watchlist: [], liked: [], watched: [] });
const loading = ref(true);
const tab = ref('watchlist');
const tabs = [
  { id: 'watchlist', label: 'Watchlist', title: 'Nothing queued', empty: 'Tap + on any film to save it for later.' },
  { id: 'liked', label: 'Liked', title: 'No favourites yet', empty: 'Films you give a thumbs-up land here — and sharpen your picks.' },
  { id: 'watched', label: 'Watched', title: 'Ticket book empty', empty: 'Mark films as watched so we never suggest them again.' },
];

onMounted(async () => {
  try {
    lib.value = await Movies.library();
    for (const list of Object.values(lib.value)) for (const m of list) ui.remember(m.id, m.interaction);
  } catch (e) {
    ui.toast(e.message, 'error');
  } finally {
    loading.value = false;
  }
});

// Reflect optimistic changes live (e.g. removing from watchlist on this page).
const items = computed(() => {
  const key = { watchlist: 'inWatchlist', watched: 'watched' }[tab.value];
  return lib.value[tab.value].filter((m) => {
    const s = ui.stateOf(m.id);
    return key ? s[key] : s.reaction === 'like';
  });
});
const current = computed(() => tabs.find((t) => t.id === tab.value));
</script>

<template>
  <main class="container page">
    <p class="label">Your ticket book</p>
    <h1>My library</h1>
    <div class="tabs" role="tablist">
      <button v-for="t in tabs" :key="t.id" role="tab" :aria-selected="tab === t.id" class="tab" :class="{ active: tab === t.id }" @click="tab = t.id">
        {{ t.label }} <span class="n">{{ loading ? '·' : lib[t.id].length }}</span>
      </button>
    </div>
    <div v-if="loading" class="grid"><div v-for="n in 6" :key="n" class="skeleton" style="aspect-ratio: 2/3" /></div>
    <div v-else-if="items.length" class="grid">
      <MovieCard v-for="m in items" :key="m.id" :movie="m" :show-reason="false" />
    </div>
    <div v-else class="empty card">
      <h2>{{ current.title }}</h2>
      <p>{{ current.empty }}</p>
      <RouterLink to="/home" class="btn btn-primary">Discover films</RouterLink>
    </div>
  </main>
</template>

<style scoped>
.page { padding-top: 34px; padding-bottom: 70px; }
h1 { font-size: clamp(52px, 7vw, 96px); margin-top: 6px; }
.tabs { display: flex; gap: 0; margin: 26px 0 34px; border-bottom: 2px solid var(--ink); }
.tab { position: relative; background: none; border: 2px solid transparent; border-bottom: 0; padding: 12px 18px; margin-bottom: -2px; font: 700 13px var(--mono); text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3); border-radius: 3px 3px 0 0; }
.tab.active { color: var(--ink); border-color: var(--ink); background: var(--card); }
.tab.active::after { content: ''; position: absolute; left: 0; right: 0; bottom: -2px; height: 2px; background: var(--card); }
.n { margin-left: 6px; padding: 2px 7px; background: var(--ink); color: var(--paper); font-size: 11px; }
.tab.active .n { background: var(--red); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 30px 22px; }
.empty { padding: 44px; display: grid; gap: 12px; justify-items: start; max-width: 560px; }
.empty h2 { font-size: 44px; color: var(--red); }
.empty p { font-style: italic; color: var(--ink-2); }
</style>
