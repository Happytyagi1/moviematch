import { createRouter, createWebHistory } from 'vue-router';
import { useAuth } from './stores/auth.js';

// Route-level code splitting: each page is its own chunk.
const routes = [
  { path: '/', name: 'landing', component: () => import('./views/LandingView.vue'), meta: { guest: true } },
  { path: '/signin', name: 'signin', component: () => import('./views/AuthView.vue'), meta: { guest: true }, props: { mode: 'signin' } },
  { path: '/signup', name: 'signup', component: () => import('./views/AuthView.vue'), meta: { guest: true }, props: { mode: 'signup' } },
  { path: '/privacy', name: 'privacy', component: () => import('./views/PrivacyView.vue') }, // public: signed in or not
  { path: '/welcome', name: 'onboarding', component: () => import('./views/OnboardingView.vue'), meta: { auth: true, onboarding: true } },
  { path: '/home', name: 'home', component: () => import('./views/HomeView.vue'), meta: { auth: true } },
  { path: '/search', name: 'search', component: () => import('./views/SearchView.vue'), meta: { auth: true } },
  { path: '/library', name: 'library', component: () => import('./views/LibraryView.vue'), meta: { auth: true } },
  { path: '/profile', name: 'profile', component: () => import('./views/ProfileView.vue'), meta: { auth: true } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export function createAppRouter(history = createWebHistory()) {
  const router = createRouter({
    history,
    routes,
    scrollBehavior: (_to, _from, saved) => saved || { top: 0 },
  });

  router.beforeEach(async (to) => {
    const auth = useAuth();
    await auth.init();
    if (to.meta.auth && !auth.isAuthed) return { name: 'signin', query: { next: to.fullPath } };
    if (to.meta.guest && auth.isAuthed) return { name: auth.user.onboarded ? 'home' : 'onboarding' };
    if (to.meta.auth && !to.meta.onboarding && !auth.user.onboarded) return { name: 'onboarding' };
    return true;
  });

  return router;
}
