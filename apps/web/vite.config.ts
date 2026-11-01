import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig, lazyPlugins } from 'vite-plus';

// The background of the graphite palette (SPEC §5.13): splash screen and window title bar.
const GRAPHITE = '#1B1E23';

export default defineConfig({
  plugins: lazyPlugins(() => [
    vue(),
    VitePWA({
      // A new version waits for "Odśwież", so it never reloads in the middle of a workout.
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'LiftWise',
        short_name: 'LiftWise',
        lang: 'pl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: GRAPHITE,
        theme_color: GRAPHITE,
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,ico}'],
        // The Worker answers these itself; the app shell must not shadow them.
        navigateFallbackDenylist: [/^\/api\//, /^\/health$/],
      },
    }),
  ]),
  define: {
    __VUE_I18N_FULL_INSTALL__: true,
    __VUE_I18N_LEGACY_API__: false,
    __INTLIFY_PROD_DEVTOOLS__: false,
  },
  server: {
    // `pnpm --filter @liftwise/api dev` (wrangler dev) on its default port.
    proxy: { '/api': 'http://localhost:8787' },
  },
  test: {
    environment: 'happy-dom',
    // Dexie runs on an in-memory IndexedDB in tests.
    setupFiles: ['fake-indexeddb/auto'],
  },
});
