<script setup>
import { useRouter } from 'vue-router';
import { useAuth } from '../stores/auth.js';
import { useUi } from '../stores/ui.js';
import Icon from './Icon.vue';

// Sign-in is Google-only: passwords, 2-step verification and recovery are managed in the
// person's Google account, so this panel shows the connection and offers a global sign-out.
const auth = useAuth();
const ui = useUi();
const router = useRouter();

async function signOutEverywhere() {
  await auth.logoutAll();
  ui.toast('Signed out on all devices');
  router.replace('/signin');
}
</script>

<template>
  <section class="card block">
    <h2>Security</h2>

    <div class="method">
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg>
      <span>Google</span>
      <span class="who">{{ auth.user?.email }}</span>
      <span class="badge on">Connected</span>
    </div>
    <p class="muted">
      You sign in with your Google account. Manage its password and 2-step verification at
      <a class="text-link" href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer">myaccount.google.com</a>.
    </p>

    <h3>Devices</h3>
    <p class="muted">Signed in somewhere you don’t recognise? This ends every session, including this one.</p>
    <button class="btn btn-ghost btn-sm" @click="signOutEverywhere"><Icon name="logout" :size="16" /> Sign out of all devices</button>
  </section>
</template>

<style scoped>
.block { padding: clamp(22px, 3vw, 36px); display: grid; gap: 18px; }
h2 { font-size: clamp(30px, 3.4vw, 44px); }
h3 { font: 700 12.5px var(--mono); text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-3); margin-top: 10px; }
.method { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 14px 16px; border: 2px solid var(--ink); border-radius: 3px; background: var(--paper); font: 800 22px/1 var(--display); text-transform: uppercase; }
.who { font: 400 14px var(--mono); text-transform: none; color: var(--ink-3); overflow-wrap: anywhere; }
.badge { margin-left: auto; padding: 4px 9px; border: 2px solid var(--ink); font: 700 11px var(--mono); text-transform: uppercase; letter-spacing: 0.08em; background: var(--card); color: var(--ink-3); }
.badge.on { background: var(--ok); color: var(--paper); border-color: var(--ok); }
.muted { font-style: italic; color: var(--ink-2); }
.block > .btn { width: fit-content; }
</style>
