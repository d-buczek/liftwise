import { existsSync } from 'node:fs';
import type { CapacitorConfig } from '@capacitor/cli';

// The Android app (SPEC §6.10). Its API origin comes from the gitignored `.env.android.local`,
// which `vp build --mode android` reads as well.
const ENV_FILE = '.env.android.local';
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

// Plain HTTP only for a dev server on the LAN; the page itself is https://localhost (CORS, §6.8).
const insecureApi = process.env.VITE_API_URL?.startsWith('http://') ?? false;

const config: CapacitorConfig = {
  appId: 'io.github.d_buczek.liftwise',
  appName: 'LiftWise',
  webDir: 'dist',
  // The splash screen's graphite until the page paints.
  backgroundColor: '#1B1E23',
  server: { androidScheme: 'https', cleartext: insecureApi },
  android: { allowMixedContent: insecureApi },
  plugins: {
    // Ionic pads the header and the tab bar with env(safe-area-inset-*).
    SystemBars: { insetsHandling: 'native', initialViewportFitValueHint: 'cover' },
    LocalNotifications: { smallIcon: 'ic_stat_rest' },
  },
};

export default config;
