<script setup>
import { onMounted, ref } from 'vue';
import { Movies } from '../api.js';
import MovieRow from '../components/MovieRow.vue';

// Real, browsable rows for guests. Opening a film, its trailer and "Where to watch" work
// without an account; liking or saving a film sends them to sign up (see stores/ui.js).
const sections = ref([]);
const browseLoading = ref(true);
const browseFailed = ref(false);
onMounted(async () => {
  try {
    sections.value = (await Movies.browse()).sections;
  } catch {
    browseFailed.value = true;
  } finally {
    browseLoading.value = false;
  }
});
const notes = [
  { n: 'I', title: 'The screen test', text: 'Two minutes of questions: the genres you love, the films you’d rewatch, the mood you’re usually in. No rating marathons.' },
  { n: 'II', title: 'The projectionist', text: 'A hybrid model trained on 100,000 real ratings finds what people with your taste loved — and why.' },
  { n: 'III', title: 'The encore', text: 'Every thumbs-up and thumbs-down recuts your list on the spot. Tomorrow’s picks are better than today’s.' },
];
</script>

<template>
  <main class="landing">

    <!-- Browsable programme for guests: open any film, watch trailers, see where to stream it. -->
    <section id="programme" class="programme" aria-labelledby="programme-title">
      <div class="filmstrip" aria-hidden="true" />
      <div class="container programme-head">
        <h2 id="programme-title">Now showing</h2>
        <p>Open any film for its trailer and where to watch it. <RouterLink class="text-link" to="/signup">Create a free account</RouterLink> to like films, build a watchlist and get picks made for you.</p>
      </div>
      <p v-if="browseFailed" class="container browse-error">The programme didn’t load. Please refresh the page.</p>
      <template v-else-if="browseLoading">
        <MovieRow v-for="n in 2" :key="n" :index="n" title="Loading…" loading />
      </template>
      <MovieRow v-for="(s, i) in sections" v-else :key="s.id" :index="i + 1" :title="s.title" :movies="s.items" />
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
/* ---- "Now showing": real rows guests can browse ---- */
.programme { margin-top: 8px; padding-bottom: 20px; scroll-margin-top: 16px; }
.programme-head { display: grid; gap: 8px; padding-top: 34px; padding-bottom: 6px; }
.programme-head h2 { font-size: clamp(44px, 6vw, 76px); }
.programme-head p { font: italic 400 19px/1.45 var(--serif); color: var(--ink-2); max-width: 62ch; }
.browse-error { padding: 30px 0; font: italic 400 18px var(--serif); }

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
  .cols { grid-template-columns: 1fr; }
  .note + .note { border-left: 0; border-top: 2px solid var(--ink); padding-left: 0; }
}
</style>
