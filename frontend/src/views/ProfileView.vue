<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Movies } from '../api.js';
import { useAuth } from '../stores/auth.js';
import { useUi } from '../stores/ui.js';
import MoviePoster from '../components/MoviePoster.vue';
import Icon from '../components/Icon.vue';
import SecurityPanel from '../components/SecurityPanel.vue';
import { AUDIENCE_INFO, DISCOVERY_INFO, ERA_INFO, MOOD_INFO } from '../utils/movie.js';

const auth = useAuth();
const ui = useUi();
const router = useRouter();
const favorites = ref([]);
const model = ref(null);
const confirming = ref(false);
const p = computed(() => auth.user?.preferences || {});

onMounted(async () => {
  const [f, m] = await Promise.allSettled([Movies.favorites(), Movies.model()]);
  if (f.status === 'fulfilled') favorites.value = f.value.movies;
  if (m.status === 'fulfilled') model.value = m.value;
});

const metrics = computed(() => {
  const ev = model.value?.evaluation;
  if (!ev) return [];
  const pop = ev.baselines.popularity['ndcg@10'];
  const best = ev.best.metrics['ndcg@10'];
  return [
    { label: 'Ranking quality (NDCG@10)', value: best.toFixed(3), note: `+${Math.round((best / pop - 1) * 100)}% vs. “just show popular movies”` },
    { label: 'Hit rate @10', value: `${Math.round(ev.best.metrics['hit_rate@10'] * 100)}%`, note: 'of users get ≥1 future favourite in their top 10' },
    { label: 'Catalogue coverage', value: `${Math.round(ev.best.metrics.coverage * 100)}%`, note: 'of movies get recommended to someone' },
  ];
});

async function remove() {
  await auth.deleteAccount();
  ui.toast('Your account and data were deleted');
  router.replace('/');
}
</script>

<template>
  <main class="container page">
    <header class="head">
      <div class="avatar">{{ auth.firstName.charAt(0).toUpperCase() }}</div>
      <div>
        <p class="label">Member card · since {{ new Date(auth.user?.createdAt || Date.now()).getFullYear() }}</p>
        <h1>{{ auth.user?.name }}</h1>
        <p class="email">{{ auth.user?.email }}</p>
      </div>
      <RouterLink to="/welcome" class="btn btn-primary"><Icon name="refresh" :size="18" /> Retake the quiz</RouterLink>
    </header>

    <section class="card block">
      <h2>Your taste, <span class="serif-italic">on file</span></h2>
      <dl class="facts">
        <div><dt class="label">Loves</dt><dd class="chips"><span v-for="g in p.genres" :key="g" class="tag">{{ g }}</span></dd></div>
        <div v-if="p.avoidGenres?.length"><dt class="label">Cut from programme</dt><dd class="chips"><span v-for="g in p.avoidGenres" :key="g" class="tag struck">{{ g }}</span></dd></div>
        <div v-if="p.moods?.length"><dt class="label">Moods</dt><dd class="chips"><span v-for="m in p.moods" :key="m" class="tag">{{ MOOD_INFO[m]?.label }}</span></dd></div>
        <div v-if="p.eras?.length"><dt class="label">Eras</dt><dd class="chips"><span v-for="e in p.eras" :key="e" class="tag">{{ ERA_INFO[e]?.label }}</span></dd></div>
        <div><dt class="label">Style</dt><dd class="chips"><span class="tag">{{ DISCOVERY_INFO[p.discovery]?.label }}</span><span class="tag">{{ AUDIENCE_INFO[p.audience]?.label }}</span></dd></div>
      </dl>
      <p class="label fav-h">All-time favourites</p>
      <div class="favs">
        <button v-for="(m, i) in favorites" :key="m.id" class="fav" :style="{ '--r': `${(i % 3) - 1}deg` }" :aria-label="m.title" @click="ui.openMovie(m.id)"><MoviePoster :movie="m" /></button>
      </div>
    </section>

    <section v-if="model" class="card block projector">
      <h2>How MovieMatch <span class="serif-italic">picks for you</span></h2>
      <p class="explain">
        A hybrid machine-learning model trained on <b>{{ model.count.toLocaleString() }} films</b> and 100k real ratings from the MovieLens dataset.
        It blends <b>collaborative filtering</b> (what people with similar taste loved) with <b>content similarity</b> (genres &amp; descriptive tags).
        Your answers and every thumbs-up or thumbs-down shape a personal taste vector that scores the whole catalogue instantly.
      </p>
      <div class="metrics">
        <div v-for="m in metrics" :key="m.label" class="metric">
          <span class="value">{{ m.value }}</span>
          <span class="m-label">{{ m.label }}</span>
          <span class="note">{{ m.note }}</span>
        </div>
      </div>
      <p class="label">Evaluated offline: {{ model.evaluation.split }} · model {{ model.version }}</p>
    </section>

    <SecurityPanel />

    <section class="card block danger-zone">
      <h2>Account</h2>
      <div class="row">
        <p>Permanently delete your account, taste profile and library.</p>
        <button v-if="!confirming" class="btn btn-danger" @click="confirming = true">Delete account</button>
        <div v-else class="confirm">
          <span class="label">Are you sure?</span>
          <button class="btn btn-ghost btn-sm" @click="confirming = false">Cancel</button>
          <button class="btn btn-danger btn-sm" @click="remove">Yes, delete</button>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.page { padding-top: 34px; padding-bottom: 70px; display: grid; gap: 30px; max-width: 1080px; }
.head { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; }
.head .btn { margin-left: auto; }
.avatar { width: 92px; height: 92px; border-radius: 50%; display: grid; place-items: center; background: var(--mustard); border: 2px solid var(--ink); box-shadow: 5px 5px 0 var(--ink); font: 900 46px/1 var(--display); }
h1 { font-size: clamp(42px, 5vw, 70px); }
.email { font: 400 13px var(--mono); color: var(--ink-3); margin-top: 6px; }
.block { padding: clamp(22px, 3vw, 36px); }
.block h2 { font-size: clamp(30px, 3.4vw, 44px); margin-bottom: 22px; }
.block h2 .serif-italic { color: var(--red); }
.facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 20px; margin: 0; }
.facts dd { margin: 8px 0 0; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.tag.struck { text-decoration: line-through; text-decoration-color: var(--red); text-decoration-thickness: 2px; }
.fav-h { margin-top: 30px; }
.favs { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 16px; margin-top: 12px; }
.fav { padding: 0; border: 2px solid var(--ink); border-radius: 2px; overflow: hidden; box-shadow: 3px 3px 0 var(--ink); transform: rotate(var(--r)); transition: transform 0.2s var(--ease); }
.fav:hover { transform: rotate(0) translateY(-4px); }
/* the ML card is the one dark sheet on the page */
.projector { background: var(--ink); color: var(--paper); box-shadow: 8px 8px 0 var(--red); }
.projector h2 .serif-italic { color: var(--mustard); }
.projector .label { color: #b7a98f; }
.explain { max-width: 70ch; color: #e3d8c3; }
.explain b { color: var(--mustard); }
.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0; margin: 28px 0 18px; border: 2px solid var(--paper); }
.metric { display: grid; gap: 4px; padding: 20px; }
.metric + .metric { border-left: 2px dashed rgba(241, 232, 214, 0.5); }
.value { font: 900 64px/0.9 var(--display); color: var(--red); }
.m-label { font: 700 12.5px var(--mono); text-transform: uppercase; letter-spacing: 0.1em; color: var(--paper); }
.note { font: italic 400 15px var(--serif); color: #cfc2a8; }
.danger-zone .row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.confirm { display: flex; align-items: center; gap: 8px; }
@media (max-width: 600px) { .metric + .metric { border-left: 0; border-top: 2px dashed rgba(241, 232, 214, 0.5); } }
</style>
