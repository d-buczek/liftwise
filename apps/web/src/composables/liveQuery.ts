import { liveQuery, type Subscription } from 'dexie';
import { onScopeDispose, shallowRef, watch, type Ref, type WatchSource } from 'vue';

// A ref that follows a Dexie query and updates whenever the tables it read change. With `deps`
// the query starts over when they change (e.g. the shown month).
export function useLiveQuery<T, I = T>(
  query: () => T | Promise<T>,
  initial: I,
  deps?: WatchSource,
): Ref<T | I> {
  const result = shallowRef<T | I>(initial);
  let subscription: Subscription | null = null;
  const subscribe = () => {
    subscription?.unsubscribe();
    subscription = liveQuery(query).subscribe({
      next: (value) => (result.value = value),
      error: (error: unknown) => console.error(error),
    });
  };
  subscribe();
  if (deps) watch(deps, subscribe);
  onScopeDispose(() => subscription?.unsubscribe());
  return result;
}
