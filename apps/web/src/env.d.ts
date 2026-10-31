/// <reference types="vite-plugin-pwa/vue" />

// Lets the TypeScript 7 type check in `vp check` resolve .vue imports; vue-tsc checks the SFCs themselves
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

interface ImportMetaEnv {
  // Absolute API origin for the Android app (LW-08); the PWA uses its own origin.
  readonly VITE_API_URL?: string;
}
