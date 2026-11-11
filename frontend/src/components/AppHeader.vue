<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../stores/auth.js';
import AppLogo from './AppLogo.vue';
import HeaderSearch from './HeaderSearch.vue';
import Icon from './Icon.vue';

// Header for signed-in users. Guests get GuestHeader.vue (same search box).
const auth = useAuth();
const router = useRouter();
const scrolled = ref(false);
const menuOpen = ref(false);

const onScroll = () => { scrolled.value = window.scrollY > 10; };
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }));
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll));

async function logout() {
  menuOpen.value = false;
  await auth.logout();
  router.push({ name: 'landing' });
}
</script>

<template>
  <header class="header" :class="{ scrolled }">
    <div class="container inner">
      <RouterLink to="/home" aria-label="MovieMatch home"><AppLogo /></RouterLink>
      <nav class="nav" aria-label="Main">
        <RouterLink to="/home">For you</RouterLink>
        <RouterLink to="/library">My library</RouterLink>
      </nav>
      <HeaderSearch />
      <div class="profile">
        <button class="avatar" :aria-expanded="menuOpen" aria-haspopup="menu" aria-label="Account menu" @click="menuOpen = !menuOpen">
          {{ auth.firstName.charAt(0).toUpperCase() || '?' }}
        </button>
        <Transition name="page">
          <div v-if="menuOpen" class="menu" role="menu" @click="menuOpen = false">
            <p class="who"><b>{{ auth.user?.name }}</b><span>{{ auth.user?.email }}</span></p>
            <RouterLink to="/profile" role="menuitem"><Icon name="user" :size="17" /> Taste profile</RouterLink>
            <RouterLink to="/library" role="menuitem"><Icon name="bookmark" :size="17" /> Watchlist</RouterLink>
            <RouterLink to="/welcome" role="menuitem"><Icon name="refresh" :size="17" /> Retake the quiz</RouterLink>
            <button role="menuitem" @click="logout"><Icon name="logout" :size="17" /> Sign out</button>
          </div>
        </Transition>
        <div v-if="menuOpen" class="click-away" @click="menuOpen = false" />
      </div>
    </div>
  </header>
</template>

<style scoped>
.header { position: sticky; top: 0; z-index: 50; height: var(--header-h); transition: background 0.25s, box-shadow 0.25s; border-bottom: 2px solid transparent; }
.header.scrolled { background: rgba(241, 232, 214, 0.94); backdrop-filter: blur(6px); border-color: var(--ink); }
.inner { height: 100%; display: flex; align-items: center; gap: 28px; }
.nav { display: flex; gap: 22px; }
.nav a { position: relative; padding: 6px 0; font: 700 13px var(--mono); text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-2); }
.nav a:hover { color: var(--ink); }
.nav a.router-link-active { color: var(--ink); }
.nav a.router-link-active::after { content: ''; position: absolute; left: 0; right: 0; bottom: -2px; height: 4px; background: var(--red); transform: skewX(-20deg); }
.profile { position: relative; }
.avatar { width: 44px; height: 44px; border-radius: 50%; border: 2px solid var(--ink); background: var(--mustard); font: 900 22px/1 var(--display); box-shadow: 3px 3px 0 var(--ink); }
.menu {
  position: absolute; right: 0; top: 56px; z-index: 2; width: 250px; padding: 8px; display: grid;
  background: var(--card); border: 2px solid var(--ink); border-radius: 3px; box-shadow: var(--hard-lg);
}
.who { display: grid; padding: 8px 10px 12px; border-bottom: 2px dashed var(--rule-strong); margin-bottom: 6px; }
.who b { font: 800 20px/1 var(--display); text-transform: uppercase; }
.who span { font: 400 12px var(--mono); color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; margin-top: 4px; }
.menu a, .menu button { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 2px; background: none; border: 0; text-align: left; font: 700 12.5px var(--mono); text-transform: uppercase; letter-spacing: 0.06em; }
.menu a:hover, .menu button:hover { background: var(--mustard); }
.click-away { position: fixed; inset: 0; z-index: 1; }
@media (max-width: 760px) {
  .nav { display: none; }
  .inner { gap: 12px; }
  .inner > a :deep(.word) { display: none; }
}
</style>
