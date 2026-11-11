<script setup>
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Movies } from '../api.js';
import MovieCard from '../components/MovieCard.vue';

const route = useRoute();
const movies = ref([]);
const loading = ref(false);
const error = ref('');
let ctl;

watch(
  () => route.query.q,
  async (q) => {
    if (typeof q !== 'string' || !q.trim()) { movies.value = []; return; }
    ctl?.abort();
    ctl = new AbortController();
    loading.value = true;
    error.value = '';
    try {
      movies.value = (await Movies.search(q, ctl.signal)).movies;
    } catch (e) {
      if (e.name !== 'AbortError') error.value = e.message;
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <main class="container page">
    <p class="label">From the archive · {{ loading ? '…' : movies.length }} result{{ movies.length === 1 ? '' : 's' }}</p>
    <h1>“{{ route.query.q }}”</h1>
    <p v-if="error" class="field-error">{{ error }}</p>
    <div class="grid">
      <template v-if="loading"><div v-for="n in 12" :key="n" class="skeleton" style="aspect-ratio: 2/3" /></template>
      <MovieCard v-for="m in movies" v-else :key="m.id" :movie="m" />
    </div>
    <div v-if="!loading && !movies.length && !error" class="empty card">
      <h2>Lost reel</h2>
      <p>Nothing in the archive matches that. Try a different spelling, or a shorter part of the title.</p>
    </div>
  </main>
</template>

<style scoped>
.page { padding-top: 34px; padding-bottom: 70px; }
h1 { font-size: clamp(44px, 6vw, 84px); margin: 8px 0 30px; overflow-wrap: anywhere; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 30px 22px; }
.empty { padding: 40px; display: grid; gap: 10px; max-width: 560px; }
.empty h2 { font-size: 44px; color: var(--red); }
.empty p { font-style: italic; color: var(--ink-2); }
</style>
