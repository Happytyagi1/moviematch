import { defineStore } from 'pinia';
import { Movies } from '../api.js';

let toastId = 0;

/** Toasts, the movie-details modal and the user's per-movie state (optimistic). */
export const useUi = defineStore('ui', {
  state: () => ({
    toasts: [],
    modalMovieId: null,
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
    openMovie(id) {
      this.modalMovieId = id;
    },
    closeMovie() {
      this.modalMovieId = null;
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
    /** Optimistic update with rollback on failure. */
    async interact(movie, patch, message) {
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
