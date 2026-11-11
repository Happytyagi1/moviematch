<script setup>
defineProps({ size: { type: Number, default: 38 } });
</script>

<template>
  <span class="logo">
    <!-- a ticket stub -->
    <svg :width="size" :height="size * 0.78" viewBox="0 0 64 50" aria-hidden="true">
      <path d="M3 3h58v13a9 9 0 0 0 0 18v13H3V34a9 9 0 0 0 0-18z" fill="var(--red)" stroke="var(--ink)" stroke-width="3" />
      <path d="M44 6v38" stroke="#fff8ec" stroke-width="2" stroke-dasharray="3 3" />
      <text x="24" y="32.5" text-anchor="middle" textLength="24" lengthAdjust="spacingAndGlyphs" font-family="Big Shoulders Display, Arial Narrow, sans-serif" font-weight="900" font-size="19" fill="#fff8ec">MM</text>
    </svg>
    <span class="word">Movie<b>Match</b></span>
  </span>
</template>

<style scoped>
.logo { display: inline-flex; align-items: center; gap: 10px; }
.word { font: 900 26px/1 var(--display); text-transform: uppercase; letter-spacing: 0.01em; }
.word b { color: var(--red); font-weight: 900; }
</style>
