import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { useThemeStore } from './theme';

function mockSystemDark(matches: boolean) {
  const listeners: ((event: { matches: boolean }) => void)[] = [];
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches,
    addEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
      listeners.push(listener),
  } as unknown as MediaQueryList);
  return (value: boolean) => listeners.forEach((listener) => listener({ matches: value }));
}

const isDark = () => document.documentElement.classList.contains('ion-palette-dark');

describe('theme store', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.head.innerHTML = '<meta name="theme-color" content="">';
    setActivePinia(createPinia());
  });

  it('follows the system by default, also when it changes', async () => {
    const setSystemDark = mockSystemDark(true);
    const theme = useThemeStore();
    expect(theme.preference).toBe('system');
    expect(isDark()).toBe(true);
    expect(document.querySelector('meta')?.getAttribute('content')).toBe('#2A2F35');

    setSystemDark(false);
    await nextTick();
    expect(isDark()).toBe(false);
    expect(document.querySelector('meta')?.getAttribute('content')).toBe('#F1F2EE');
  });

  it('applies and stores an explicit choice over the system', async () => {
    mockSystemDark(true);
    const theme = useThemeStore();
    theme.preference = 'light';
    await nextTick();
    expect(isDark()).toBe(false);
    expect(localStorage.getItem('liftwise.theme')).toBe('light');
  });

  it('restores the stored choice and ignores unknown values', () => {
    mockSystemDark(false);
    localStorage.setItem('liftwise.theme', 'dark');
    expect(useThemeStore().preference).toBe('dark');
    expect(isDark()).toBe(true);

    setActivePinia(createPinia());
    localStorage.setItem('liftwise.theme', 'sepia');
    expect(useThemeStore().preference).toBe('system');
  });
});
