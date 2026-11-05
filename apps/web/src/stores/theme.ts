import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { defineStore } from 'pinia';
import { computed, ref, watch, watchEffect } from 'vue';

// The look of the app, chosen in settings and kept on the device, not synced: the standard light or
// dark, the system's choice of those two, or a theme (all three themes are dark).
export type Theme = 'light' | 'dark' | 'temper' | 'sheen' | 'iron';
export type ThemePreference = 'system' | Theme;
export const THEME_PREFERENCES: ThemePreference[] = [
  'system',
  'light',
  'dark',
  'temper',
  'sheen',
  'iron',
];
const DEFAULT_PREFERENCE: ThemePreference = 'temper';

const STORAGE_KEY = 'liftwise.theme';
// The window title bar and the browser's Android status bar take the page background.
const THEME_COLORS: Record<Theme, string> = {
  light: '#EDF0F4',
  dark: '#1B1E23',
  temper: '#0B1626',
  sheen: '#0B111A',
  iron: '#1A1B1D',
};

function storedPreference(): ThemePreference {
  const value = localStorage.getItem(STORAGE_KEY);
  return THEME_PREFERENCES.find((preference) => preference === value) ?? DEFAULT_PREFERENCE;
}

export const useThemeStore = defineStore('theme', () => {
  const preference = ref(storedPreference());
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const systemDark = ref(media.matches);
  media.addEventListener('change', (event) => (systemDark.value = event.matches));

  const current = computed<Theme>(() =>
    preference.value === 'system' ? (systemDark.value ? 'dark' : 'light') : preference.value,
  );
  const dark = computed(() => current.value !== 'light');

  watch(preference, (value) => localStorage.setItem(STORAGE_KEY, value));
  watchEffect(() => {
    document.documentElement.classList.toggle('ion-palette-dark', dark.value);
    document.documentElement.dataset.theme = current.value;
    // Scrollbars and native controls follow the look, not the OS.
    document.documentElement.style.colorScheme = dark.value ? 'dark' : 'light';
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLORS[current.value]);
    // The Android app draws behind its system bars; their icons must stay readable.
    if (Capacitor.isNativePlatform())
      void SystemBars.setStyle({
        style: dark.value ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
      });
  });

  return { preference, current, dark };
});
