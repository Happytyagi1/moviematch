<script setup>
import Icon from './Icon.vue';

// Phone-only bottom navigation for signed-in users. On small screens the header's
// "For you" / "My library" links are hidden to make room for search, so they live here.
const tabs = [
  { to: '/home', label: 'For you', icon: 'sparkle' },
  { to: '/library', label: 'Library', icon: 'bookmark' },
  { to: '/profile', label: 'Profile', icon: 'user' },
];
</script>

<template>
  <!-- spacer so the bar never covers the end of the page -->
  <div class="tab-spacer" aria-hidden="true" />
  <nav class="tabbar" aria-label="Main">
    <RouterLink v-for="t in tabs" :key="t.to" :to="t.to" class="tab">
      <Icon :name="t.icon" :size="20" />
      <span>{{ t.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.tabbar, .tab-spacer { display: none; }
@media (max-width: 760px) {
  .tab-spacer { display: block; height: calc(64px + env(safe-area-inset-bottom)); }
  .tabbar {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 60; display: grid; grid-template-columns: repeat(3, 1fr);
    padding-bottom: env(safe-area-inset-bottom); background: var(--paper); border-top: 2px solid var(--ink);
  }
  .tab {
    display: grid; justify-items: center; align-content: center; gap: 3px; height: 62px; color: var(--ink-3);
    font: 700 10.5px var(--mono); text-transform: uppercase; letter-spacing: 0.1em; position: relative;
  }
  .tab.router-link-active { color: var(--ink); }
  .tab.router-link-active::before { content: ''; position: absolute; top: 0; left: 28%; right: 28%; height: 4px; background: var(--red); transform: skewX(-20deg); }
}
</style>
