<script setup>
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from './stores/auth.js';
import { useUi } from './stores/ui.js';
import AppHeader from './components/AppHeader.vue';
import SiteFooter from './components/SiteFooter.vue';
import MovieModal from './components/MovieModal.vue';
import ToastHost from './components/ToastHost.vue';

const route = useRoute();
const auth = useAuth();
const ui = useUi();
const showHeader = computed(() => route.meta.auth && !route.meta.onboarding);
// Credits + privacy link on every page except the full-screen quiz.
const showFooter = computed(() => !!route.name && !route.meta.onboarding);

// Load the user's watchlist/likes once per session so every card shows the right state.
watch(
  () => auth.user?.id,
  (id) => {
    if (id) ui.loadState();
    else ui.interactions = {};
  },
  { immediate: true },
);
</script>

<template>
  <AppHeader v-if="showHeader" />
  <RouterView v-slot="{ Component }">
    <Transition name="page" mode="out-in">
      <component :is="Component" :key="route.name" />
    </Transition>
  </RouterView>
  <SiteFooter v-if="showFooter" />
  <MovieModal />
  <ToastHost />
</template>
