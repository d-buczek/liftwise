import { computed, ref, type ComputedRef } from 'vue';
import { today } from '../workout/calendar';

// The device's local date that follows the clock, so an app left open overnight shows the new
// day: checked every minute and when the app shows again.
const date = ref(today());
const current = computed(() => date.value);
let following = false;

export function useToday(): ComputedRef<string> {
  if (!following) {
    following = true;
    const update = () => (date.value = today());
    update();
    setInterval(update, 60_000);
    document.addEventListener('visibilitychange', update);
  }
  return current;
}
