import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8080' },
  },
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Firebase (sign-in only) gets its own lazily loaded chunk so other pages don't download it.
        manualChunks: (id) => (/node_modules[\\/](firebase|@firebase)[\\/]/.test(id) ? 'firebase' : id.includes('node_modules') ? 'vendor' : undefined),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
  },
});
