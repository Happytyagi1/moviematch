<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import MovieCard from './MovieCard.vue';
import Icon from './Icon.vue';
import { pad2 } from '../utils/movie.js';

defineProps({ title: String, subtitle: String, movies: { type: Array, default: () => [] }, loading: Boolean, index: { type: Number, default: 1 } });
const track = ref(null);
const canLeft = ref(false);
const canRight = ref(true);

function update() {
  const el = track.value;
  if (!el) return;
  canLeft.value = el.scrollLeft > 4;
  canRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
}
function scroll(dir) {
  track.value.scrollBy({ left: dir * track.value.clientWidth * 0.85, behavior: 'smooth' });
}
let ro;
onMounted(() => {
  update();
  ro = new ResizeObserver(update);
  if (track.value) ro.observe(track.value);
});
onBeforeUnmount(() => ro?.disconnect());
</script>

<template>
  <section class="row" :style="{ '--row-delay': `${0.12 * index}s` }">
    <header class="row-head container">
      <div class="titles">
        <span class="num" aria-hidden="true">Programme №{{ pad2(index) }}</span>
        <h2>{{ title }}</h2>
        <p v-if="subtitle" class="sub">{{ subtitle }}</p>
      </div>
      <div class="arrows">
        <button class="icon-btn" :disabled="!canLeft" aria-label="Scroll left" @click="scroll(-1)"><Icon name="left" /></button>
        <button class="icon-btn" :disabled="!canRight" aria-label="Scroll right" @click="scroll(1)"><Icon name="right" /></button>
      </div>
    </header>
    <div ref="track" class="track" @scroll.passive="update">
      <template v-if="loading">
        <div v-for="n in 8" :key="n" class="cell"><div class="skeleton" style="aspect-ratio: 2/3" /></div>
      </template>
      <div v-for="(m, i) in movies" v-else :key="m.id" class="cell" :style="{ animationDelay: `calc(var(--row-delay) + ${Math.min(i, 8) * 0.05}s)` }"><MovieCard :movie="m" /></div>
    </div>
  </section>
</template>

<style scoped>
.row { margin-bottom: 56px; }
.row-head { display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 18px; margin-bottom: 20px; padding-top: 22px; position: relative; }
.row-head::before { content: ''; position: absolute; left: clamp(16px, 4vw, 48px); right: clamp(16px, 4vw, 48px); top: 0; border-top: 2px dashed var(--rule-strong); }
.num { display: block; margin-bottom: 8px; font: 700 12px/1 var(--mono); text-transform: uppercase; letter-spacing: 0.14em; color: var(--red-deep); }
h2 { font-size: clamp(26px, 3vw, 40px); font-weight: 900; }
.sub { font: italic 400 15px/1.3 var(--serif); color: var(--ink-2); margin-top: 6px; }
.arrows { display: flex; gap: 8px; }
.arrows .icon-btn:disabled { opacity: 0.3; cursor: default; }
.track {
  display: grid; grid-auto-flow: column; grid-auto-columns: clamp(150px, 15vw, 200px); gap: clamp(16px, 1.8vw, 26px);
  overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x mandatory; scrollbar-width: none;
  padding: 6px max(clamp(16px, 4vw, 48px), calc((100vw - 1360px) / 2 + 48px)) 14px;
  scroll-padding: 0 max(clamp(16px, 4vw, 48px), calc((100vw - 1360px) / 2 + 48px));
}
.track::-webkit-scrollbar { display: none; }
.cell { scroll-snap-align: start; min-width: 0; animation: fade-up 0.6s var(--ease) both; }
@media (max-width: 640px) { .arrows { display: none; } .row-head { grid-template-columns: 1fr; } }
</style>
