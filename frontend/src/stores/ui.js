import { defineStore } from 'pinia';
import { Movies } from '../api.js';
import { useAuth } from './auth.js';

let toastId = 0;

// A guest's like / watchlist / watched click, remembered across sign-up so it isn't lost.
const PENDING_KEY = 'mm_pending_action';
const PENDING_MAX_AGE_MS = 30 * 60 * 1000;
const PENDING_MESSAGES = {
  inWatchlist: (t) => `Added “${t}” to your watchlist`,
  like: (t) => `Liked “${t}”: we’ll find more like it`,
  dislike: (t) => `Noted: fewer films like “${t}”`,
  watched: (t) => `Marked “${t}” as watched`,
};
const intentOf = (patch) => (patch.inWatchlist ? 'watchlist' : patch.reaction === 'like' ? 'like' : patch.reaction === 'dislike' ? 'dislike' : 'watched');

/** Toasts, the movie-details modal and the user's per-movie state (optimistic). */
export const useUi = defineStore('ui', {
  state: () => ({
    toasts: [],
    modalMovieId: null,
    modalAutoplay: false, // open the details window with the trailer already playing
    modalShowProviders: false, // open it with "Where to watch" already expanded
    // Set when a guest tries to like/save a film; App.vue sends them to sign up.
    signInPrompt: null, // { title, intent }
    interactions: {}, // movieId -> { reaction, inWatchlist, watched }
  }),
  actions: {
    toast(text, type = 'info', ms = 2800) {
      const id = ++toastId;
      this.toasts.push({ id, text, type });
      setTimeout(() => this.dismiss(id), ms);
    },
    dismiss(id) {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    },
    openMovie(id, { playTrailer = false, showProviders = false } = {}) {
      this.modalAutoplay = playTrailer;
      this.modalShowProviders = showProviders;
      this.modalMovieId = id;
    },
    closeMovie() {
      this.modalMovieId = null;
      this.modalAutoplay = false;
      this.modalShowProviders = false;
    },
    stateOf(id) {
      return this.interactions[id] || { reaction: null, inWatchlist: false, watched: false };
    },
    async loadState() {
      try {
        this.interactions = (await Movies.libraryState()).state;
      } catch {
        /* non-critical: buttons just start in their default state */
      }
    },
    remember(id, interaction) {
      this.interactions[id] = { ...this.stateOf(id), ...interaction };
    },
    /** Optimistic update with rollback on failure. Guests are sent to sign up instead. */
    async interact(movie, patch, message) {
      if (!useAuth().isAuthed) {
        // Only "turning something on" is worth remembering (a guest can't undo anything).
        const on = patch.inWatchlist || patch.watched || patch.reaction;
        if (on) {
          try {
            sessionStorage.setItem(PENDING_KEY, JSON.stringify({ movieId: movie.id, title: movie.title, patch, at: Date.now() }));
          } catch { /* storage unavailable: they'll just click again after signing in */ }
        }
        this.closeMovie();
        this.signInPrompt = { title: movie.title, intent: intentOf(patch) };
        return;
      }
      const prev = { ...this.stateOf(movie.id) };
      this.remember(movie.id, patch);
      try {
        const { interaction } = await Movies.interact(movie.id, patch);
        this.remember(movie.id, interaction);
        if (message) this.toast(message, 'success');
      } catch (e) {
        this.interactions[movie.id] = prev;
        this.toast(e.message, 'error');
      }
    },
    /** After sign-in: apply the like/save a guest tried before they had an account. */
    async applyPendingAction() {
      let pending;
      try {
        pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
        sessionStorage.removeItem(PENDING_KEY);
      } catch {
        return;
      }
      if (!pending?.movieId || !pending.patch || Date.now() - (pending.at || 0) > PENDING_MAX_AGE_MS) return;
      const kind = pending.patch.inWatchlist ? 'inWatchlist' : pending.patch.watched ? 'watched' : pending.patch.reaction;
      const message = PENDING_MESSAGES[kind]?.(pending.title);
      await this.interact({ id: pending.movieId, title: pending.title }, pending.patch, message);
    },
    toggleWatchlist(movie) {
      const on = !this.stateOf(movie.id).inWatchlist;
      return this.interact(movie, { inWatchlist: on }, on ? `Added “${movie.title}” to your watchlist` : 'Removed from watchlist');
    },
    react(movie, reaction) {
      const next = this.stateOf(movie.id).reaction === reaction ? null : reaction;
      const msg = next === 'like' ? 'Got it — we’ll find more like this' : next === 'dislike' ? 'Noted — fewer like this' : null;
      return this.interact(movie, { reaction: next }, msg);
    },
    toggleWatched(movie) {
      const on = !this.stateOf(movie.id).watched;
      return this.interact(movie, { watched: on }, on ? 'Marked as watched' : null);
    },
  },
});
