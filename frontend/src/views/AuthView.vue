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
// Arriving from a poster click on the reel: "?film=<title>".
const filmNotice = () => (typeof route.query.film === 'string' && route.query.film
  ? { type: 'info', text: `Sign in first to see “${route.query.film.slice(0, 120)}” and how well it matches your taste.` }
  : null);
const initial = route.query.expired ? QUERY_MESSAGES.expired : null;
const notice = ref(initial ? { type: initial[0], text: initial[1] } : filmNotice());

watch(() => props.mode, () => { notice.value = null; });
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
      <template v-if="isSignup">Already have an account? <RouterLink class="text-link" :to="{ name: 'signin', query: route.query.next ? { next: route.query.next } : {} }">Sign in</RouterLink></template>
      <template v-else>New to MovieMatch? <RouterLink class="text-link" :to="{ name: 'signup', query: route.query.next ? { next: route.query.next } : {} }">Create an account</RouterLink></template>
    </p>
  </AuthShell>
</template>

<style scoped>
.lead { font: italic 400 18px/1.45 var(--serif); color: var(--ink-2); margin-bottom: 6px; }
.fine-print { font: 400 12.5px/1.5 var(--mono); color: var(--ink-3); margin-top: 6px; }
</style>
