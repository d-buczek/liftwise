import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

// Vibration through the Haptics plugin on Android (the WebView can't vibrate by itself), the
// Vibration API in the browser where it exists.
export function vibrate(pattern: number[]) {
  if (Capacitor.isNativePlatform()) {
    const duration = pattern.reduce((sum, ms) => sum + ms, 0);
    void Haptics.vibrate({ duration });
  } else if ('vibrate' in navigator) navigator.vibrate(pattern);
}

// A short tap confirming an action, Android only.
export function tap() {
  if (Capacitor.isNativePlatform()) void Haptics.impact({ style: ImpactStyle.Light });
}
