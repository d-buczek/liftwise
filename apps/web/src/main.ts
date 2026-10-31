import { IonicVue } from '@ionic/vue';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { i18n } from './i18n';
import { router } from './router';
import { useSyncStore } from './stores/sync';
import { useThemeStore } from './stores/theme';

import '@ionic/vue/css/core.css';
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';
import '@fontsource-variable/archivo/wdth.css';
import './theme/variables.css';
import './theme/global.css';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// One look on Android and the PC: Material mode everywhere (SPEC §5.13).
const app = createApp(App)
  .use(IonicVue, { mode: 'md', animated: !reducedMotion })
  .use(createPinia())
  .use(i18n)
  .use(router);

// Applies the palette before the first paint.
useThemeStore();

void router.isReady().then(() => {
  app.mount('#app');
  useSyncStore().start();
});
