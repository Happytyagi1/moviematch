<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useUi } from '../stores/ui.js';
import { Movies } from '../api.js';
import MoviePoster from './MoviePoster.vue';
import MovieCard from './MovieCard.vue';
import Icon from './Icon.vue';
import WhereToWatch from './WhereToWatch.vue';
import { formatRuntime, posterGradient, stars } from '../utils/movie.js';

const ui = useUi();
const data = ref(null);
const error = ref('');
const dialog = ref(null);
let lastFocus = null;

const movie = computed(() => data.value?.movie);
const state = computed(() => (movie.value ? ui.stateOf(movie.value.id) : {}));

// Trailer: YouTube's privacy-enhanced player, created only when the person presses Play
// (so nothing loads from YouTube just by opening a film).
const trailer = computed(() => data.value?.trailer || null);
const playing = ref(false);
const trailerSrc = computed(() =>
  trailer.value ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.value.key)}?autoplay=1&rel=0&playsinline=1` : '',
);
// "Where to watch" panel (streaming / rent / buy), loaded only when opened.
const showWhere = ref(false);
const wherePanel = ref(null);
async function toggleWhere() {
  showWhere.value = !showWhere.value;
  if (showWhere.value) {
    await nextTick();
    wherePanel.value?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }
}

function playTrailer() {
  playing.value = true;
  dialog.value?.scrollTo?.({ top: 0, behavior: 'smooth' });
}

async function load(id) {
  data.value = null;
  error.value = '';
  playing.value = false;
  showWhere.value = false;
  try {
    const res = await Movies.details(id);
    if (ui.modalMovieId !== id) return; // user already opened another movie
    ui.remember(id, res.interaction);
    data.value = res;
    // Opened from a "Play trailer" button elsewhere: start it straight away.
    if (ui.modalAutoplay && res.trailer) playing.value = true;
    ui.modalAutoplay = false;
    await nextTick();
    dialog.value?.scrollTo?.({ top: 0 }); // scrolling is cosmetic: never let it turn a loaded film into an error
    // Opened from a "Where to watch" button elsewhere: expand that panel and scroll to it.
    if (ui.modalShowProviders) {
      ui.modalShowProviders = false;
      await toggleWhere();
    }
  } catch (e) {
    error.value = e.message;
  }
}

function onKey(e) {
  if (e.key === 'Escape') ui.closeMovie();
}

watch(
  () => ui.modalMovieId,
  async (id, old) => {
    if (id) {
      if (!old) {
        lastFocus = document.activeElement;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKey);
      }
      load(id);
      await nextTick();
      dialog.value?.focus();
    } else {
      playing.value = false; // closing the window stops the video
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
      lastFocus?.focus?.();
    }
  },
);
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <Transition name="modal">
    <div v-if="ui.modalMovieId" class="backdrop" @click.self="ui.closeMovie()">
      <div ref="dialog" class="dialog" role="dialog" aria-modal="true" :aria-label="movie?.title || 'Movie details'" tabindex="-1">
        <!-- Hidden while a trailer plays: it would sit on top of YouTube's player controls. -->
        <button v-if="!(playing && trailer)" class="icon-btn close" aria-label="Close" @click="ui.closeMovie()"><Icon name="x" /></button>

        <div v-if="error" class="state">{{ error }}</div>
        <div v-else-if="!movie" class="state"><div class="skeleton" style="width: 100%; height: 320px" /></div>

        <template v-else>
          <div v-if="playing && trailer" class="player">
            <iframe
              :src="trailerSrc" :title="`${movie.title}: ${trailer.name}`"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen
              referrerpolicy="strict-origin-when-cross-origin"
            />
            <button class="btn btn-sm stop" @click="playing = false"><Icon name="x" :size="16" /> Close trailer</button>
          </div>
          <div v-else class="hero" :data-title="movie.backdrop ? '' : movie.title" :style="{ '--bg': posterGradient(movie.id), backgroundImage: movie.backdrop ? `url(${movie.backdrop})` : 'none' }">
            <span class="slug">Reel {{ String(movie.id).padStart(5, '0') }} · {{ movie.genres.join(' / ') }}</span>
            <button v-if="trailer" class="play-badge" :aria-label="`Play the trailer for ${movie.title}`" @click="playTrailer">
              <span class="tri" aria-hidden="true" /> Play trailer
            </button>
          </div>
          <div class="body" :class="{ 'after-player': playing && trailer }">
            <div class="poster"><MoviePoster :movie="movie" large /></div>
            <div class="info">
              <h2>{{ movie.title }}</h2>
              <p class="facts">
                <span>{{ movie.year }}</span>
                <span v-if="movie.runtime">{{ formatRuntime(movie.runtime) }}</span>
                <span>★ {{ stars(movie.rating) }} <em>/ {{ movie.ratingCount }} ratings</em></span>
              </p>
              <div class="genres">
                <span v-for="g in movie.genres" :key="g" class="tag">{{ g }}</span>
              </div>
              <p v-if="movie.overview" class="overview">{{ movie.overview }}</p>
              <div v-if="movie.tags?.length" class="keywords">
                <span class="label">Audiences call it</span>
                <span class="kw-list">{{ movie.tags.map((t) => `“${t}”`).join(', ') }}</span>
              </div>

              <div class="actions">
                <button v-if="trailer" class="btn btn-primary" @click="playing ? (playing = false) : playTrailer()">
                  <span class="tri sm" aria-hidden="true" /> {{ playing ? 'Stop trailer' : 'Play trailer' }}
                </button>
                <button class="btn" :class="{ 'btn-primary': state.inWatchlist }" :aria-pressed="!!state.inWatchlist" @click="ui.toggleWatchlist(movie)">
                  <Icon :name="state.inWatchlist ? 'check' : 'plus'" :size="18" />
                  {{ state.inWatchlist ? 'In watchlist' : 'Add to watchlist' }}
                </button>
                <button class="icon-btn lg" :class="{ active: state.reaction === 'like' }" :aria-pressed="state.reaction === 'like'" aria-label="I like this" @click="ui.react(movie, 'like')"><Icon name="up" /></button>
                <button class="icon-btn lg" :class="{ active: state.reaction === 'dislike' }" :aria-pressed="state.reaction === 'dislike'" aria-label="Not for me" @click="ui.react(movie, 'dislike')"><Icon name="down" /></button>
                <button class="btn" :class="{ 'btn-primary': state.watched }" :aria-pressed="!!state.watched" @click="ui.toggleWatched(movie)">
                  <Icon :name="state.watched ? 'check' : 'eye'" :size="18" /> {{ state.watched ? 'Watched' : 'Mark watched' }}
                </button>
                <button class="btn" :class="{ 'btn-primary': showWhere }" :aria-expanded="showWhere" aria-controls="where-panel" @click="toggleWhere">
                  <Icon name="film" :size="18" /> Where to watch
                </button>
              </div>
              <div v-if="showWhere" id="where-panel" ref="wherePanel"><WhereToWatch :movie-id="movie.id" :title="movie.title" /></div>
              <a v-if="movie.imdbId" class="imdb" :href="`https://www.imdb.com/title/tt${movie.imdbId}/`" target="_blank" rel="noopener">View on IMDb ↗</a>
            </div>
          </div>

          <section v-if="data.similar?.length" class="similar">
            <div class="filmstrip" aria-hidden="true" />
            <h3>If you like this, try…</h3>
            <div class="grid">
              <MovieCard v-for="m in data.similar" :key="m.id" :movie="m" :show-reason="false" />
            </div>
          </section>
        </template>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.backdrop {
  position: fixed; inset: 0; z-index: 100; background: rgba(22, 19, 15, 0.62);
  display: grid; place-items: start center; overflow-y: auto; padding: 5vh 16px;
}
.dialog {
  position: relative; width: min(1000px, 100%); background: var(--card); border: 2px solid var(--ink);
  border-radius: 4px; overflow: hidden; box-shadow: 12px 12px 0 var(--red); outline: none;
}
.close { position: absolute; top: 16px; right: 16px; z-index: 3; }
.state { padding: 40px; }
.hero { position: relative; height: 230px; background-color: var(--bg); background-size: cover; background-position: center 25%; border-bottom: 2px solid var(--ink); }
/* giant outlined title printed across the band when there's no backdrop photo */
.hero::before {
  content: attr(data-title); position: absolute; left: 260px; right: 0; bottom: -0.12em; overflow: hidden; white-space: nowrap;
  font: 900 150px/1 var(--display); text-transform: uppercase; color: transparent; -webkit-text-stroke: 2px rgba(241, 232, 214, 0.35);
}
.hero::after { content: ''; position: absolute; inset: 0; background-image: var(--halftone); background-size: 7px 7px; opacity: 0.5; mix-blend-mode: multiply; }
.slug { position: absolute; left: 36px; top: 22px; z-index: 1; padding: 6px 10px; background: var(--paper); border: 2px solid var(--ink); font: 700 11.5px/1 var(--mono); text-transform: uppercase; letter-spacing: 0.1em; }
/* trailer player replaces the banner: 16:9, black, like a projection screen */
.player { position: relative; aspect-ratio: 16 / 9; background: #000; border-bottom: 2px solid var(--ink); }
.player iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.stop { position: absolute; left: 16px; top: 16px; z-index: 2; }
.body.after-player { margin-top: 0; padding-top: 28px; }
.body.after-player .info { padding-top: 0; }
.play-badge {
  position: absolute; left: 36px; bottom: 22px; z-index: 2; display: inline-flex; align-items: center; gap: 10px; padding: 10px 16px 10px 12px;
  background: var(--red); color: #fff8ec; border: 2px solid var(--ink); border-radius: 3px; box-shadow: 4px 4px 0 var(--ink);
  font: 700 13px var(--mono); text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s;
}
.play-badge:hover { transform: translate(-2px, -2px); box-shadow: 6px 6px 0 var(--ink); }
/* a printed "play" triangle */
.tri { width: 0; height: 0; border-style: solid; border-width: 8px 0 8px 13px; border-color: transparent transparent transparent currentColor; }
.tri.sm { border-width: 6px 0 6px 10px; }
.body { display: grid; grid-template-columns: 230px 1fr; gap: 36px; padding: 0 36px 34px; margin-top: -120px; position: relative; }
.poster { border: 2px solid var(--ink); border-radius: 3px; overflow: hidden; box-shadow: var(--hard-lg); align-self: start; transform: rotate(-2deg); }
.info { padding-top: 136px; display: grid; gap: 14px; align-content: start; }
h2 { font-size: clamp(38px, 5vw, 66px); font-weight: 900; }
.facts { display: flex; flex-wrap: wrap; gap: 6px 18px; font: 700 13px var(--mono); text-transform: uppercase; letter-spacing: 0.06em; }
.facts em { font-style: normal; font-weight: 400; color: var(--ink-3); }
.genres { display: flex; flex-wrap: wrap; gap: 6px; }
.overview { color: var(--ink-2); max-width: 62ch; font-size: 17px; }
.keywords { display: grid; gap: 4px; }
.kw-list { font: italic 400 17px/1.4 var(--serif); }
.actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; }
.icon-btn.lg { width: 48px; height: 48px; box-shadow: 4px 4px 0 var(--ink); }
.imdb { font: 700 12px var(--mono); text-transform: uppercase; letter-spacing: 0.08em; width: fit-content; border-bottom: 2px solid var(--red); }
.similar { padding: 0 0 36px; }
.similar h3 { font-size: 30px; margin: 26px 36px 18px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 24px 20px; padding: 0 36px; }
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-active .dialog, .modal-leave-active .dialog { transition: transform 0.35s var(--ease); }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .dialog { transform: translateY(40px) rotate(1.5deg); }
@media (max-width: 720px) {
  .body { grid-template-columns: 1fr; padding: 0 20px 24px; margin-top: -90px; }
  .poster { width: 150px; }
  .info { padding-top: 0; }
  .hero { height: 170px; }
  .slug { left: 20px; }
  .play-badge { left: auto; right: 20px; bottom: 100px; }
  .similar h3, .grid { margin-left: 20px; margin-right: 20px; padding: 0; }
}
</style>
