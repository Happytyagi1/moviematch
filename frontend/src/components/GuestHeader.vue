<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import AppLogo from './AppLogo.vue';
import HeaderSearch from './HeaderSearch.vue';

// Header for visitors who aren't signed in: logo, the same search box as signed-in
// users, and sign in. Shown on the pages guests can browse (landing, search results).
const scrolled = ref(false);
const onScroll = () => { scrolled.value = window.scrollY > 10; };
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }));
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll));
</script>

<template>
  <header class="header" :class="{ scrolled }">
    <div class="container inner">
      <RouterLink to="/" aria-label="MovieMatch home"><AppLogo /></RouterLink>
      <HeaderSearch />
      <RouterLink to="/signin" class="btn btn-sm btn-ghost signin">Sign in</RouterLink>
    </div>
  </header>
</template>

<style scoped>
.header { position: sticky; top: 0; z-index: 50; height: var(--header-h); transition: background 0.25s, box-shadow 0.25s; border-bottom: 2px solid transparent; }
.header.scrolled { background: rgba(241, 232, 214, 0.94); backdrop-filter: blur(6px); border-color: var(--ink); }
.inner { height: 100%; display: flex; align-items: center; gap: 28px; }
.signin { flex-shrink: 0; }
@media (max-width: 760px) {
  .inner { gap: 12px; }
  .inner > a :deep(.word) { display: none; }
}
</style>
