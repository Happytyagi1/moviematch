<script setup>
// Small inline SVG icon set (no icon-font download).
defineProps({ name: { type: String, required: true }, size: { type: [Number, String], default: 20 } });
const paths = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm10 17-5.2-5.2',
  heart: 'M12 20s-7-4.4-9.2-8.6C1.4 8.5 3.3 5 6.6 5c2 0 3.3 1.1 4.1 2.3h2.6C14.1 6.1 15.4 5 17.4 5c3.3 0 5.2 3.5 3.8 6.4C19 15.6 12 20 12 20Z',
  up: 'M7 10v10H4V10h3Zm3 10h7.6a2 2 0 0 0 2-1.6l1.3-6.5A2 2 0 0 0 19 9.5h-5.3l.8-3.8A1.8 1.8 0 0 0 12.7 4L10 10v10Z',
  down: 'M17 14V4h3v10h-3Zm-3-10H6.4a2 2 0 0 0-2 1.6L3.1 12.1A2 2 0 0 0 5 14.5h5.3l-.8 3.8a1.8 1.8 0 0 0 1.8 1.7L14 14V4Z',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5 10 17.5 19.5 7',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  x: 'M6 6l12 12M18 6 6 18',
  left: 'M15 5 8 12l7 7',
  right: 'M9 5l7 7-7 7',
  star: 'M12 3.5 14.6 9l6 .6-4.5 4 1.3 5.9L12 16.6 6.6 19.5l1.3-5.9-4.5-4 6-.6L12 3.5Z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0',
  bookmark: 'M6 3h12v18l-6-4-6 4V3Z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm7 11 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  film: 'M4 4h16v16H4V4Zm4 0v16m8-16v16M4 8h4m-4 4h4m-4 4h4m8-8h4m-4 4h4m-4 4h4',
  lock: 'M6 11h12v10H6V11Zm2 0V8a4 4 0 0 1 8 0v3',
  mail: 'M3 6h18v12H3V6Zm0 0 9 7 9-7',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
};
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path :d="paths[name]" />
  </svg>
</template>
