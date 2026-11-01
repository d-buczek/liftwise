import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

// The rest timer (§5.3): started by a done set, kept on the device, so a reload doesn't lose a
// running rest; one that ended meanwhile is dropped.
export const REST_ADJUST_S = 15;

const STORAGE_KEY = 'liftwise.rest';
const TICK_MS = 250;
const VIBRATION_MS = [300, 150, 300];

type Timer = { endsAt: number; totalS: number };

function storedTimer(now: number): Timer | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Timer> | null;
    if (typeof value?.endsAt === 'number' && typeof value.totalS === 'number' && value.endsAt > now)
      return { endsAt: value.endsAt, totalS: value.totalS };
  } catch {
    // A broken value is the same as none.
  }
  return null;
}

export const useRestStore = defineStore('rest', () => {
  const now = ref(Date.now());
  const timer = ref<Timer | null>(storedTimer(now.value));
  // The rest ended in the app: shown until dismissed or the next set.
  const finished = ref(false);
  let interval: ReturnType<typeof setInterval> | undefined;

  const running = computed(() => timer.value !== null);
  const remainingS = computed(() =>
    timer.value ? Math.max(0, Math.ceil((timer.value.endsAt - now.value) / 1000)) : 0,
  );
  // The share of the rest left, for the bar.
  const progress = computed(() =>
    timer.value ? Math.min(1, remainingS.value / timer.value.totalS) : 0,
  );

  function tick() {
    now.value = Date.now();
    if (timer.value && timer.value.endsAt <= now.value) {
      timer.value = null;
      finished.value = true;
      if ('vibrate' in navigator) navigator.vibrate(VIBRATION_MS);
    }
  }

  watch(
    timer,
    (value) => {
      if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      else localStorage.removeItem(STORAGE_KEY);
      clearInterval(interval);
      interval = value ? setInterval(tick, TICK_MS) : undefined;
    },
    { immediate: true, flush: 'sync' },
  );
  // Background tabs tick slowly; catch up when the app shows again.
  document.addEventListener('visibilitychange', tick);

  // 0 s (the exercise has no rest) stops the timer.
  function start(seconds: number) {
    finished.value = false;
    now.value = Date.now();
    timer.value = seconds > 0 ? { endsAt: now.value + seconds * 1000, totalS: seconds } : null;
  }

  function adjust(seconds: number) {
    if (!timer.value) return;
    const { endsAt, totalS } = timer.value;
    timer.value = { endsAt: endsAt + seconds * 1000, totalS: Math.max(1, totalS + seconds) };
    tick();
  }

  function skip() {
    timer.value = null;
    finished.value = false;
  }

  function dismiss() {
    finished.value = false;
  }

  return { running, finished, remainingS, progress, start, adjust, skip, dismiss };
});
