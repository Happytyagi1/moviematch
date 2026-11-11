<script setup>
import { computed, ref } from 'vue';
import { posterInks } from '../utils/movie.js';

// `bare` hides the printed title when the parent shows its own caption.
const props = defineProps({ movie: { type: Object, required: true }, large: Boolean, bare: Boolean });
const failed = ref(false);
const src = computed(() => (props.large ? props.movie.posterLarge || props.movie.poster : props.movie.poster));
const ink = computed(() => posterInks(props.movie.id));
</script>

<template>
  <div class="poster" :style="{ '--bg': ink.bg, '--fg': ink.fg, '--ac': ink.accent, '--blend': ink.blend }">
    <img v-if="src && !failed" :src="src" :alt="`${movie.title} poster`" loading="lazy" decoding="async" @error="failed = true" />
    <!-- Screen-printed fallback: two inks, a geometric motif, halftone, misregistered title -->
    <div v-else class="print" :data-shape="ink.shape" aria-hidden="true">
      <span class="motif" />
      <span class="dots" />
      <span class="genre">{{ movie.genres?.[0] || 'Film' }}</span>
      <span class="year">{{ movie.year }}</span>
      <span v-if="!bare" class="title" :data-text="movie.title">{{ movie.title }}</span>
    </div>
  </div>
</template>

<style scoped>
.poster { position: relative; aspect-ratio: 2 / 3; overflow: hidden; border-radius: inherit; container-type: inline-size; background: var(--bg); }
img { width: 100%; height: 100%; object-fit: cover; filter: contrast(1.04) saturate(0.92); }
.print { position: absolute; inset: 0; color: var(--fg); }
.motif { position: absolute; background: var(--ac); mix-blend-mode: var(--blend, multiply); opacity: 0.88; }
.print[data-shape='0'] .motif { width: 92cqi; aspect-ratio: 1; border-radius: 50%; top: 10%; right: -30%; }
.print[data-shape='1'] .motif { inset: 18% -20% auto -20%; height: 26%; transform: rotate(-14deg); }
.print[data-shape='2'] .motif { width: 64cqi; aspect-ratio: 1; top: 14%; left: 18%; transform: rotate(45deg); }
.print[data-shape='3'] .motif { inset: 0 auto 0 58%; width: 18%; box-shadow: -34cqi 0 0 var(--ac); }
.print[data-shape='3'] .motif { opacity: 0.45; }
/* tiny thumbnails: just the print, no micro-text */
@container (max-width: 60px) { .genre, .year, .title { display: none; } }
.dots { position: absolute; inset: 0; background-image: var(--halftone); background-size: 6px 6px; mix-blend-mode: multiply; opacity: 0.55;
  -webkit-mask: linear-gradient(160deg, transparent 30%, #000 85%); mask: linear-gradient(160deg, transparent 30%, #000 85%); }
.genre, .year { position: absolute; top: 7%; font: 700 clamp(8px, 6.5cqi, 12px)/1 var(--mono); text-transform: uppercase; letter-spacing: 0.12em; }
.genre { left: 8%; }
.year { right: 8%; }
.title {
  position: absolute; left: 7%; right: 7%; bottom: 6%;
  font: 900 clamp(14px, 15cqi, 46px)/0.86 var(--display); text-transform: uppercase; letter-spacing: 0.005em;
  display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
  /* riso misregistration */
  text-shadow: 0.06em 0.05em 0 var(--ac);
}
</style>
