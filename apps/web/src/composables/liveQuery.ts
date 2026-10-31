import { liveQuery } from 'dexie';
import { onScopeDispose, shallowRef, type Ref } from 'vue';

// A ref that follows a Dexie query and updates whenever the tables it read change.
export function useLiveQuery<T, I = T>(query: () => T | Promise<T>, initial: I): Ref<T | I> {
  const result = shallowRef<T | I>(initial);
  const subscription = liveQuery(query).subscribe({
    next: (value) => (result.value = value),
    error: (error: unknown) => console.error(error),
  });
  onScopeDispose(() => subscription.unsubscribe());
  return result;
}
