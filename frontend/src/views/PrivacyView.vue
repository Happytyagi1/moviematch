<script setup>
import { useAuth } from '../stores/auth.js';
import AppLogo from '../components/AppLogo.vue';

// Keep this page in step with what the code actually stores (backend/src/models).
const UPDATED = '11 November 2026';
const CONTACT_URL = 'https://github.com/Happytyagi1/moviematch/issues';
const auth = useAuth();
</script>

<template>
  <main class="privacy">
    <header class="container top">
      <RouterLink :to="auth.isAuthed ? '/home' : '/'" aria-label="MovieMatch home"><AppLogo /></RouterLink>
      <RouterLink class="text-link" :to="auth.isAuthed ? '/home' : '/'">← Back to MovieMatch</RouterLink>
    </header>

    <article class="container doc">
      <p class="label">Last updated {{ UPDATED }}</p>
      <h1>Privacy policy</h1>
      <p class="lead">
        MovieMatch is a free, non-commercial movie recommender. This page explains what we store about you, why,
        who helps us run the service, and how to delete everything.
      </p>

      <h2>What we store</h2>
      <ul>
        <li><b>From your Google account</b>, when you sign in: your name, email address, profile photo link, and an account identifier. We never see or store your Google password.</li>
        <li><b>Your taste profile</b>: your quiz answers (favourite genres, genres to avoid, favourite films, moods, eras, and viewing style).</li>
        <li><b>Your activity in the app</b>: films you like or dislike, mark as watched, or add to your watchlist, with the time of each change.</li>
        <li><b>A sign-in cookie</b> (<code>mm_session</code>) that keeps you signed in. It is strictly necessary for the app to work. We use no advertising, analytics or tracking cookies.</li>
        <li><b>Server logs</b>: like most websites, our hosting provider briefly records technical request data such as IP address, browser type and the page requested, to keep the service secure and working.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To sign you in and keep your account secure.</li>
        <li>To recommend films and explain each pick. Your likes and dislikes refine your recommendations.</li>
        <li>To show your library (watchlist, liked and watched films).</li>
      </ul>
      <p>We don't sell your data, show ads, or use your data for anything else. Your data is never used to train shared models; recommendations are computed from your own profile at the moment you ask.</p>

      <h2>Who helps us run MovieMatch</h2>
      <ul>
        <li><b>Google Cloud</b>: sign-in (Google Identity Platform) and hosting (Cloud Run), in the United States.</li>
        <li><b>MongoDB Atlas</b>: our database, hosted on Google Cloud in the United States (Iowa).</li>
        <li><b>TMDB (The Movie Database)</b>: film posters, summaries and trailer listings. Your browser loads poster images directly from TMDB, so TMDB can see your IP address. We never send TMDB your account details.</li>
        <li><b>YouTube (Google)</b>: trailers. Nothing is loaded from YouTube until you press <i>Play trailer</i>; the video then plays in YouTube's privacy-enhanced mode, and YouTube's own privacy policy applies to that playback.</li>
      </ul>
      <p>These providers process data on our behalf under their own security and privacy terms.</p>

      <h2>How long we keep it</h2>
      <p>Until you delete your account. Sign-in cookies expire after 24 hours, or after 14 days if you choose "Remember me". Server logs are kept for a limited time by our hosting provider.</p>

      <h2>Your choices</h2>
      <ul>
        <li><b>Delete your account</b> at any time: <i>Profile → Delete account</i>. This immediately and permanently deletes your profile, quiz answers, likes, watchlist and your MovieMatch sign-in identity. We keep no backups of deleted accounts.</li>
        <li><b>Sign out everywhere</b>: <i>Profile → Security → Sign out of all devices</i>.</li>
        <li><b>Retake the quiz</b> to change your taste profile, or remove individual likes and watchlist items from your library.</li>
        <li>To ask for a copy of your data or ask any privacy question, contact us via <a class="text-link" :href="CONTACT_URL" target="_blank" rel="noopener noreferrer">the project's GitHub page</a>. Please don't post personal details publicly there; ask us to reach you privately instead.</li>
      </ul>

      <h2>Children</h2>
      <p>MovieMatch is not intended for children under 13, and we don't knowingly collect their data.</p>

      <h2>Changes</h2>
      <p>If this policy changes, we'll update the date at the top of this page.</p>
    </article>
  </main>
</template>

<style scoped>
.privacy { min-height: 100vh; }
.top { display: flex; justify-content: space-between; align-items: center; height: 88px; gap: 16px; }
.doc { max-width: 760px; padding-bottom: 40px; }
h1 { font-size: clamp(48px, 7vw, 84px); margin: 8px 0 18px; }
h2 { font-size: clamp(26px, 3vw, 34px); margin: 34px 0 10px; }
.lead { font: italic 400 20px/1.5 var(--serif); color: var(--ink-2); }
p, li { font: 400 17px/1.6 var(--serif); color: var(--ink-2); }
ul { padding-left: 22px; display: grid; gap: 8px; }
b { color: var(--ink); }
code { font: 400 14px var(--mono); background: var(--card); padding: 1px 5px; border: 1px solid var(--rule-strong); }
</style>
