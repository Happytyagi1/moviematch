<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../stores/auth.js';
import AuthShell from '../components/AuthShell.vue';
import GoogleButton from '../components/GoogleButton.vue';

// Sign-in is Google-only (via Google Identity Platform). The same page serves sign-in and
// sign-up: a first Google sign-in creates the MovieMatch account.
const props = defineProps({ mode: { type: String, default: 'signin' } });
const auth = useAuth();
const router = useRouter();
const route = useRoute();

const isSignup = computed(() => props.mode === 'signup');
const remember = ref(false);
const loading = ref(false);

const QUERY_MESSAGES = {
  expired: ['error', 'Your session expired — please sign in again.'],
};
// Arriving because of a film: a poster on the reel ("?film=<title>"), or a guest pressing
// like / dislike / watchlist / watched ("&intent=..."), which is saved for after sign-in.
const INTENT_TEXT = {
  watchlist: (t) => `Create a free account to add “${t}” to your watchlist. We’ll save it as soon as you’re in.`,
  like: (t) => `Create a free account to like “${t}”, and we’ll find more films like it. We’ll save it as soon as you’re in.`,
  dislike: (t) => `Create a free account so we can show you fewer films like “${t}”. We’ll save it as soon as you’re in.`,
  watched: (t) => `Create a free account to keep track of what you’ve watched, starting with “${t}”.`,
};
const filmNotice = () => {
  const film = typeof route.query.film === 'string' ? route.query.film.slice(0, 120) : '';
  if (!film) return null;
  const intent = INTENT_TEXT[route.query.intent];
  return { type: 'info', text: intent ? intent(film) : `Sign in first to see “${film}” and how well it matches your taste.` };
};
const initial = route.query.expired ? QUERY_MESSAGES.expired : null;
const notice = ref(initial ? { type: initial[0], text: initial[1] } : filmNotice());

// Switching between sign-in and sign-up keeps the reason they came (if any).
watch(() => props.mode, () => { notice.value = filmNotice(); });
// Carry next / film / intent across the "Sign in" ↔ "Create an account" links.
const carryQuery = computed(() => Object.fromEntries(['next', 'film', 'intent'].filter((k) => typeof route.query[k] === 'string').map((k) => [k, route.query[k]])));
// Clicking another poster while already on this page: update the message and focus the button.
watch(
  () => route.query.film,
  () => {
    const n = filmNotice();
    if (!n) return;
    notice.value = n;
    document.querySelector('.google-btn')?.focus();
  },
  { flush: 'post' },
);

const nextPath = computed(() => (typeof route.query.next === 'string' && route.query.next.startsWith('/') && !route.query.next.startsWith('//') ? route.query.next : null));

async function google() {
  loading.value = true;
  notice.value = null;
  try {
    await auth.loginWithGoogle({ remember: remember.value }); // opens Google's sign-in popup
    router.replace(auth.user.onboarded ? nextPath.value || '/home' : '/welcome');
  } catch (e) {
    notice.value = { type: 'error', text: e.message };
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthShell>
    <p class="auth-eyebrow">{{ isSignup ? 'Let’s get you started' : 'Good to see you again' }}</p>
    <h1 class="auth-title">{{ isSignup ? 'Create your account' : 'Welcome back' }}</h1>

    <div v-if="notice" class="alert" :class="notice.type" :role="notice.type === 'error' ? 'alert' : 'status'">{{ notice.text }}</div>

    <div class="auth-form">
      <p class="lead">{{ isSignup ? 'One click with your Google account, then a short quiz about what you love to watch.' : 'Sign in with your Google account to pick up where you left off.' }}</p>
      <GoogleButton :label="loading ? 'Waiting for Google…' : isSignup ? 'Sign up with Google' : 'Sign in with Google'" :disabled="loading" @click="google" />
      <div class="auth-row">
        <label class="check"><input v-model="remember" type="checkbox" /> Remember me for 14 days</label>
      </div>
      <p class="fine-print">We only receive your name, email address and profile photo from Google. We never see your Google password. See our <RouterLink class="text-link" to="/privacy">privacy policy</RouterLink>.</p>
    </div>

    <p class="auth-foot">
      <template v-if="isSignup">Already have an account? <RouterLink class="text-link" :to="{ name: 'signin', query: carryQuery }">Sign in</RouterLink></template>
      <template v-else>New to MovieMatch? <RouterLink class="text-link" :to="{ name: 'signup', query: carryQuery }">Create an account</RouterLink></template>
    </p>
  </AuthShell>
</template>

<style scoped>
.lead { font: italic 400 18px/1.45 var(--serif); color: var(--ink-2); margin-bottom: 6px; }
.fine-print { font: 400 12.5px/1.5 var(--mono); color: var(--ink-3); margin-top: 6px; }
</style>
