// Lets the TypeScript 7 type check in `vp check` resolve .vue imports; vue-tsc checks the SFCs themselves
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
