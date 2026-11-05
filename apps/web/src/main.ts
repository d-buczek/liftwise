import { IonicVue } from '@ionic/vue';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { i18n } from './i18n';
import { router } from './router';
import { usePromptQueueStore } from './stores/promptQueue';
import { useSyncStore } from './stores/sync';
import { useThemeStore } from './stores/theme';

import '@ionic/vue/css/core.css';
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';
import '@fontsource-variable/sofia-sans';
import '@fontsource-variable/sofia-sans-extra-condensed';
import './theme/variables.css';
import './theme/themes.css';
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

// The first paint already has the app's font, so text doesn't jump from the system font (§5.13).
// Polish text needs two subsets of each face; a font that won't load holds the app back only briefly.
const FONT_WAIT_MS = 1_000;
const fontReady = Promise.race([
  Promise.all(
    ['Sofia Sans Variable', 'Sofia Sans Extra Condensed Variable'].map((face) =>
      document.fonts.load(`16px "${face}"`, 'aąćęłńóśźż'),
    ),
  ),
  new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS)),
]).catch(() => undefined);

void Promise.all([router.isReady(), fontReady]).then(() => {
  app.mount('#app');
  usePromptQueueStore().start();
  useSyncStore().start();
});
