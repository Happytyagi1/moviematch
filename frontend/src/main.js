import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { createAppRouter } from './router.js';
import { setUnauthorizedHandler } from './api.js';
import { useAuth } from './stores/auth.js';
import './styles/main.css';

const app = createApp(App);
const pinia = createPinia();
const router = createAppRouter();
app.use(pinia).use(router);

setUnauthorizedHandler(() => {
  const auth = useAuth();
  if (auth.user) {
    auth.user = null;
    router.push({ name: 'signin', query: { next: router.currentRoute.value.fullPath, expired: '1' } });
  }
});

app.mount('#app');
