<script setup>
import { computed, ref, watch } from 'vue';
import { Movies } from '../api.js';
import { watchLink } from '../utils/watchLinks.js';

// Streaming / rental / purchase options for one film in one country.
// Data comes from JustWatch via TMDB, which requires crediting JustWatch (see the footer below).
const props = defineProps({ movieId: { type: Number, required: true }, title: { type: String, default: '' } });

const linkFor = (p) => watchLink(p.name, props.title, data.value?.link);

const REGION_KEY = 'mm_region';
function defaultRegion() {
  try {
    const saved = localStorage.getItem(REGION_KEY);
    if (/^[A-Z]{2}$/.test(saved || '')) return saved;
  } catch { /* storage unavailable */ }
  for (const lang of navigator.languages || [navigator.language]) {
    const m = /-([A-Za-z]{2})$/.exec(lang || '');
    if (m) return m[1].toUpperCase();
  }
  return 'US';
}

const region = ref(defaultRegion());
const data = ref(null);
const loading = ref(true);
const error = ref('');
let ctl;

const regionName = (code) => {
  try {
    return new Intl.DisplayNames([navigator.language || 'en'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
};
const regionOptions = computed(() =>
  [...new Set([...(data.value?.regions || []), region.value])].map((code) => ({ code, name: regionName(code) })).sort((a, b) => a.name.localeCompare(b.name)),
);

// "Free" and "with ads" are ways to stream too, so they're shown together with subscriptions.
const groups = computed(() => {
  const d = data.value;
  if (!d) return [];
  const stream = [...d.stream, ...d.free.map((p) => ({ ...p, note: 'Free' })), ...d.ads.map((p) => ({ ...p, note: 'With ads' }))];
  return [
    { key: 'stream', label: 'Stream', hint: 'Included with a subscription, or free', items: stream },
    { key: 'rent', label: 'Rent', hint: 'Pay once, watch for a limited time', items: d.rent },
    { key: 'buy', label: 'Buy', hint: 'Pay once, keep it', items: d.buy },
  ].filter((g) => g.items.length);
});

async function load() {
  ctl?.abort();
  ctl = new AbortController();
  loading.value = true;
  error.value = '';
  try {
    data.value = (await Movies.providers(props.movieId, region.value, ctl.signal)).providers;
  } catch (e) {
    if (e.name !== 'AbortError') error.value = e.message;
  } finally {
    loading.value = false;
  }
}
watch([() => props.movieId, region], load, { immediate: true });
watch(region, (r) => {
  try { localStorage.setItem(REGION_KEY, r); } catch { /* ignore */ }
});
</script>

<template>
  <section class="where" aria-labelledby="where-title">
    <header class="where-head">
      <h3 id="where-title">Where to watch</h3>
      <label class="region">
        <span class="sr-only">Country</span>
        <select v-model="region" aria-label="Country">
          <option v-for="r in regionOptions" :key="r.code" :value="r.code">{{ r.name }}</option>
        </select>
      </label>
    </header>

    <div v-if="loading" class="rows"><div v-for="n in 2" :key="n" class="skeleton" style="height: 64px" /></div>
    <p v-else-if="error" class="empty">{{ error }}</p>
    <p v-else-if="!data" class="empty">Streaming information isn’t available right now.</p>
    <p v-else-if="!groups.length" class="empty">Not available to stream, rent or buy in {{ regionName(region) }} right now. Try another country.</p>
    <div v-else class="rows">
      <div v-for="g in groups" :key="g.key" class="row">
        <div class="kind"><b>{{ g.label }}</b><span>{{ g.hint }}</span></div>
        <ul class="providers">
          <li v-for="p in g.items" :key="`${g.key}-${p.id}`">
            <component
              :is="linkFor(p) ? 'a' : 'span'" class="provider"
              v-bind="linkFor(p) ? { href: linkFor(p).href, target: '_blank', rel: 'noopener noreferrer' } : {}"
              :title="linkFor(p) ? (linkFor(p).viaSearch ? `Search ${p.name} for “${title}”` : `See ${title} on ${p.name} (via TMDB)`) : p.name"
            >
              <img v-if="p.logo" :src="p.logo" :alt="''" width="46" height="46" loading="lazy" />
              <span v-else class="logo-fallback" aria-hidden="true">{{ p.name.charAt(0) }}</span>
              <span class="pname">{{ p.name }}<em v-if="p.note"> · {{ p.note }}</em><span v-if="linkFor(p)" class="ext" aria-hidden="true"> ↗</span></span>
              <span v-if="linkFor(p)" class="sr-only"> (opens in a new tab)</span>
            </component>
          </li>
        </ul>
      </div>
    </div>

    <footer class="where-foot">
      <a v-if="data?.link && groups.length" class="text-link" :href="data.link" target="_blank" rel="noopener noreferrer">Prices and links to each service ↗</a>
      <span class="credit">Availability data by <a href="https://www.justwatch.com/" target="_blank" rel="noopener noreferrer">JustWatch</a></span>
    </footer>
  </section>
</template>

<style scoped>
.where { display: grid; gap: 14px; padding: 18px 20px; border: 2px solid var(--ink); border-radius: 3px; background: var(--paper); box-shadow: 4px 4px 0 var(--ink); animation: fade-up 0.3s var(--ease) both; }
.where-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
h3 { font: 900 26px/1 var(--display); text-transform: uppercase; }
.region select { height: 36px; padding: 0 10px; border: 2px solid var(--ink); border-radius: 3px; background: var(--card); font: 700 12px var(--mono); text-transform: uppercase; cursor: pointer; max-width: 220px; }
.rows { display: grid; gap: 14px; }
.row { display: grid; grid-template-columns: 140px 1fr; gap: 12px; align-items: start; }
.kind { display: grid; gap: 2px; }
.kind b { font: 700 13px var(--mono); text-transform: uppercase; letter-spacing: 0.08em; }
.kind span { font: italic 400 13px/1.3 var(--serif); color: var(--ink-3); }
.providers { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 10px 14px; }
.providers li { width: 70px; }
.provider { display: grid; justify-items: center; gap: 4px; text-align: center; color: inherit; text-decoration: none; }
.providers img, .logo-fallback { width: 46px; height: 46px; border-radius: 10px; border: 2px solid var(--ink); background: var(--card); object-fit: cover; transition: transform 0.15s var(--ease), box-shadow 0.15s var(--ease); }
a.provider:hover img, a.provider:hover .logo-fallback, a.provider:focus-visible img { transform: translate(-2px, -2px); box-shadow: 3px 3px 0 var(--red); }
a.provider:hover .pname { color: var(--ink); text-decoration: underline; }
.ext { color: var(--ink-3); }
.logo-fallback { display: grid; place-items: center; font: 900 22px var(--display); }
.pname { font: 400 11px/1.25 var(--mono); color: var(--ink-2); overflow-wrap: anywhere; }
.pname em { font-style: normal; color: var(--red-deep); }
.empty { font: italic 400 16px var(--serif); color: var(--ink-2); }
.where-foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 16px; font: 400 12px var(--mono); color: var(--ink-3); border-top: 2px dashed var(--rule-strong); padding-top: 10px; }
.credit a { color: var(--ink-2); text-decoration: underline; }
@media (max-width: 560px) { .row { grid-template-columns: 1fr; } }
</style>
