<script setup>
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from './stores/auth.js';
import { useUi } from './stores/ui.js';
import AppHeader from './components/AppHeader.vue';
import GuestHeader from './components/GuestHeader.vue';
import MobileTabBar from './components/MobileTabBar.vue';
import SiteFooter from './components/SiteFooter.vue';
import MovieModal from './components/MovieModal.vue';
import ToastHost from './components/ToastHost.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const ui = useUi();
const showHeader = computed(() => auth.isAuthed && ((route.meta.auth && !route.meta.onboarding) || route.meta.browse));
const showGuestHeader = computed(() => !auth.isAuthed && !!route.meta.browse);
// Credits + privacy link on every page except the full-screen quiz.
const showFooter = computed(() => !!route.name && !route.meta.onboarding);

// Load the user's watchlist/likes once per session so every card shows the right state.
watch(
  () => auth.user?.id,
  async (id) => {
    if (id) {
      await ui.loadState();
      await ui.applyPendingAction(); // a like/save they tried as a guest
    } else ui.interactions = {};
  },
  { immediate: true },
);

// A guest pressed like / watchlist / watched: ask them to sign up (or sign in), with a reason.
watch(
  () => ui.signInPrompt,
  (p) => {
    if (!p) return;
    ui.signInPrompt = null;
    router.push({ name: 'signup', query: { film: p.title, intent: p.intent } });
  },
);
</script>

<template>
  <AppHeader v-if="showHeader" />
  <GuestHeader v-else-if="showGuestHeader" />
  <RouterView v-slot="{ Component }">
    <Transition name="page" mode="out-in">
      <component :is="Component" :key="route.name" />
    </Transition>
  </RouterView>
  <SiteFooter v-if="showFooter" />
  <MobileTabBar v-if="showHeader" />
  <MovieModal />
  <ToastHost />
</template>
