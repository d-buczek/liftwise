import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useBackButton } from '@ionic/vue';
import type { Router } from 'vue-router';

// Android's back button: Ionic closes an open overlay or menu first (priority 100, 99), then the
// router goes back through the app's history (priority 0). Without history the app returns to
// `home`, and there it is minimized, like most Android apps.
export function useAndroidBackButton(router: Router, home: string) {
  if (!Capacitor.isNativePlatform()) return;
  // Only with a listener does the plugin pass the button on to Ionic (the `backbutton` event).
  void App.addListener('backButton', () => undefined);
  useBackButton(1, (processNextHandler) => {
    // vue-router keeps the previous location in the history state.
    if ((window.history.state as { back?: string | null } | null)?.back)
      return processNextHandler();
    const route = router.currentRoute.value;
    if (route.path === home || route.meta.bare) void App.minimizeApp();
    else void router.replace(home);
  });
}
