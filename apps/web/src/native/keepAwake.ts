import { KeepAwake } from '@capacitor-community/keep-awake';

// The screen stays on while the workout screen is open: the plugin on Android, the Screen Wake
// Lock API in the browser. Where neither exists the screen just sleeps as usual.
export function keepAwake() {
  void KeepAwake.keepAwake().catch(() => undefined);
}

export function allowSleep() {
  void KeepAwake.allowSleep().catch(() => undefined);
}
