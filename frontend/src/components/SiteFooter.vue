<script setup>
// Credits required by the data providers, plus the privacy link.
// TMDB API terms §3: the notice must be shown prominently and the TMDB logo must be
// less prominent than MovieMatch's own logo (it's small and in the footer here).
// MovieLens is licensed for non-commercial use with credit to GroupLens Research.
</script>

<template>
  <footer class="site-foot">
    <div class="container inner">
      <div class="credit tmdb">
        <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" aria-label="The Movie Database (TMDB)">
          <img src="/tmdb-logo.svg" alt="TMDB logo" width="110" height="14" loading="lazy" />
        </a>
        <p>This website uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.</p>
      </div>
      <p class="credit">
        Recommendations are learned from the
        <a href="https://grouplens.org/datasets/movielens/" target="_blank" rel="noopener noreferrer">MovieLens</a>
        dataset by GroupLens Research (University of Minnesota), used for non-commercial purposes.
      </p>
      <nav class="links" aria-label="Legal">
        <RouterLink to="/privacy">Privacy policy</RouterLink>
        <span aria-hidden="true">·</span>
        <span>MovieMatch is a free, non-commercial project</span>
      </nav>
    </div>
  </footer>
</template>

<style scoped>
.site-foot { border-top: 2px solid var(--ink); background: var(--paper); margin-top: 40px; }
.inner { padding-top: 26px; padding-bottom: 30px; display: grid; gap: 12px; justify-items: center; text-align: center; }
.credit { font: 400 13px/1.5 var(--mono); color: var(--ink-3); max-width: 70ch; }
.credit a, .links a { color: var(--ink-2); text-decoration: underline; text-underline-offset: 3px; }
.tmdb { display: grid; gap: 8px; justify-items: center; }
.tmdb img { display: block; height: 14px; width: auto; }
.tmdb p { font: 400 13px/1.5 var(--mono); }
.links { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; font: 700 12px var(--mono); text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-3); }
</style>
