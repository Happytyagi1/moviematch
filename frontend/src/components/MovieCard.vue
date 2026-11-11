<script setup>
import { computed } from 'vue';
import { useUi } from '../stores/ui.js';
import MoviePoster from './MoviePoster.vue';
import Icon from './Icon.vue';
import { stars } from '../utils/movie.js';

const props = defineProps({ movie: { type: Object, required: true }, showReason: { type: Boolean, default: true } });
const ui = useUi();
const state = computed(() => ui.stateOf(props.movie.id));
</script>

<template>
  <article class="movie-card" :class="{ disliked: state.reaction === 'dislike' }">
    <div class="poster-wrap">
      <button class="poster-btn" :aria-label="`Open details for ${movie.title}`" @click="ui.openMovie(movie.id)">
        <MoviePoster :movie="movie" />
      </button>
      <span v-if="movie.match" class="stub" :title="`${movie.match}% match for you`"><b>{{ movie.match }}%</b> match</span>
      <div class="quick">
        <button class="icon-btn sm" :class="{ active: state.inWatchlist }" :aria-pressed="state.inWatchlist" :aria-label="state.inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'" @click="ui.toggleWatchlist(movie)">
          <Icon :name="state.inWatchlist ? 'check' : 'plus'" :size="17" />
        </button>
        <button class="icon-btn sm" :class="{ active: state.reaction === 'like' }" :aria-pressed="state.reaction === 'like'" aria-label="I like this" @click="ui.react(movie, 'like')">
          <Icon name="up" :size="16" />
        </button>
        <button class="icon-btn sm" :class="{ active: state.reaction === 'dislike' }" :aria-pressed="state.reaction === 'dislike'" aria-label="Not for me" @click="ui.react(movie, 'dislike')">
          <Icon name="down" :size="16" />
        </button>
      </div>
    </div>

    <div class="meta">
      <h3 class="title" :title="movie.title">{{ movie.title }}</h3>
      <p class="sub">{{ movie.year }} · ★ {{ stars(movie.rating) }} · {{ movie.genres?.[0] }}</p>
      <p v-if="showReason && movie.reason" class="reason">{{ movie.reason.text }}</p>
    </div>
  </article>
</template>

<style scoped>
.movie-card { position: relative; width: 100%; transition: opacity 0.3s; }
.movie-card.disliked { opacity: 0.35; filter: grayscale(1); }
.poster-wrap { position: relative; }
.poster-btn {
  position: relative; display: block; width: 100%; padding: 0; border: 2px solid var(--ink); background: none;
  border-radius: 3px; overflow: hidden; box-shadow: 4px 4px 0 var(--ink);
  transition: transform 0.25s var(--ease), box-shadow 0.25s var(--ease);
}
.movie-card:hover .poster-btn { transform: translate(-3px, -4px) rotate(-1deg); box-shadow: 8px 9px 0 var(--ink); }
/* perforated ticket stub */
.stub {
  position: absolute; top: 12px; right: -6px; z-index: 2; padding: 5px 10px 5px 14px;
  background: var(--mustard); color: var(--ink); border: 2px solid var(--ink);
  font: 400 11px/1 var(--mono); text-transform: uppercase; letter-spacing: 0.06em;
  -webkit-mask: radial-gradient(circle 4px at 0 50%, transparent 97%, #000); mask: radial-gradient(circle 4px at 0 50%, transparent 97%, #000);
  transform: rotate(3deg);
}
.stub b { font-weight: 700; font-size: 13px; }
.quick {
  position: absolute; left: 0; right: 0; bottom: 12px; display: flex; justify-content: center; gap: 6px;
  transform: translateY(8px); opacity: 0; transition: all 0.2s var(--ease); pointer-events: none;
}
.movie-card:hover .quick, .movie-card:focus-within .quick { opacity: 1; transform: none; pointer-events: auto; }
.poster-btn :deep(.title) { transition: opacity 0.2s; }
.movie-card:hover .poster-btn :deep(.title), .movie-card:focus-within .poster-btn :deep(.title) { opacity: 0; }
.icon-btn.sm { width: 36px; height: 36px; }
.meta { padding: 14px 2px 0; }
.title { font: 800 19px/1 var(--display); text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { margin-top: 5px; font: 400 12px/1.2 var(--mono); color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.reason { margin-top: 7px; font: italic 400 14px/1.3 var(--serif); color: var(--ink-2); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.reason::before { content: '— '; color: var(--red); }
@media (hover: none) { .quick { opacity: 1; transform: none; pointer-events: auto; } }
</style>
