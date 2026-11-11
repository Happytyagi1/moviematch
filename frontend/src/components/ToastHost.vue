<script setup>
import { useUi } from '../stores/ui.js';
const ui = useUi();
</script>

<template>
  <div class="toasts" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <button v-for="t in ui.toasts" :key="t.id" class="toast" :class="t.type" @click="ui.dismiss(t.id)">
        <span class="mark">{{ t.type === 'error' ? '✕' : t.type === 'success' ? '✓' : '›' }}</span>{{ t.text }}
      </button>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 200; display: grid; gap: 10px; justify-items: center; width: min(92vw, 460px); pointer-events: none; }
.toast {
  pointer-events: auto; display: flex; gap: 10px; align-items: baseline; padding: 12px 18px; border-radius: 3px; border: 2px solid var(--ink);
  background: var(--ink); color: var(--paper); box-shadow: 5px 5px 0 var(--red); font: 400 14px/1.35 var(--mono); text-align: left;
}
.mark { color: var(--mustard); font-weight: 700; }
.toast.error { background: var(--red); box-shadow: 5px 5px 0 var(--ink); }
.toast.error .mark { color: var(--paper); }
/* phones: sit above the bottom tab bar (and the iPhone home indicator) */
@media (max-width: 760px) { .toasts { bottom: calc(80px + env(safe-area-inset-bottom)); } }
.toast-enter-active, .toast-leave-active { transition: all 0.3s var(--ease); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(20px) rotate(-2deg); }
</style>
