import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig, lazyPlugins, type Plugin } from 'vite-plus';

// The background of Nalot, the default look (SPEC §5.13): splash screen and window title bar.
const NAVY = '#0B1626';

// SPEC §6.8. A <meta> tag, so the APK has it as well as the PWA. Builds only: the dev server's hot
// reload needs more than this allows.
function contentSecurityPolicy(): Plugin {
  let apiOrigin = '';
  return {
    name: 'liftwise:csp',
    apply: 'build',
    configResolved({ env }) {
      // The APK's page is https://localhost and its API another origin (`api/client.ts`).
      if (env.VITE_API_URL) apiOrigin = ` ${new URL(env.VITE_API_URL).origin}`;
    },
    transformIndexHtml: () => [
      {
        tag: 'meta',
        injectTo: 'head-prepend',
        attrs: {
          'http-equiv': 'Content-Security-Policy',
          content: [
            "default-src 'self'",
            // Ionic's components and transitions add <style> elements at runtime.
            "style-src 'self' 'unsafe-inline'",
            // Ionic's CSS has its marks as data URLs.
            "img-src 'self' data:",
            // Vite inlines the small subsets of the app's fonts.
            "font-src 'self' data:",
            `connect-src 'self'${apiOrigin}`,
            "object-src 'none'",
            "base-uri 'none'",
            "form-action 'none'",
          ].join('; '),
        },
      },
    ],
  };
}

export default defineConfig({
  plugins: lazyPlugins(() => [
    vue(),
    contentSecurityPolicy(),
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
        background_color: NAVY,
        theme_color: NAVY,
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
