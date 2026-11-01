import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { defineStore } from 'pinia';
import { computed, ref, watch, watchEffect } from 'vue';

// Light or dark follows the system unless chosen in settings; kept on the device, not synced.
export type ThemePreference = 'system' | 'light' | 'dark';
export const THEME_PREFERENCES: ThemePreference[] = ['system', 'light', 'dark'];

const STORAGE_KEY = 'liftwise.theme';
// The window title bar and the browser's Android status bar take the page background.
const THEME_COLORS = { light: '#EDF0F4', dark: '#1B1E23' };

function storedPreference(): ThemePreference {
  const value = localStorage.getItem(STORAGE_KEY);
  return THEME_PREFERENCES.find((preference) => preference === value) ?? 'system';
}

export const useThemeStore = defineStore('theme', () => {
  const preference = ref(storedPreference());
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const systemDark = ref(media.matches);
  media.addEventListener('change', (event) => (systemDark.value = event.matches));

  const dark = computed(
    () => preference.value === 'dark' || (preference.value === 'system' && systemDark.value),
  );

  watch(preference, (value) => localStorage.setItem(STORAGE_KEY, value));
  watchEffect(() => {
    document.documentElement.classList.toggle('ion-palette-dark', dark.value);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark.value ? THEME_COLORS.dark : THEME_COLORS.light);
    // The Android app draws behind its system bars; their icons must stay readable.
    if (Capacitor.isNativePlatform())
      void SystemBars.setStyle({
        style: dark.value ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
      });
  });

  return { preference, dark };
});
