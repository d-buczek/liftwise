import { liveQuery, type Subscription } from 'dexie';
import { onScopeDispose, shallowRef, watch, type Ref, type WatchSource } from 'vue';

// A ref that follows a Dexie query and updates whenever the tables it read change. With `deps`
// the query starts over when they change (e.g. the shown month).
export function useLiveQuery<T, I = T>(
  query: () => T | Promise<T>,
  initial: I,
  deps?: WatchSource,
): Ref<T | I> {
  return useLiveQueryState(query, initial, deps).data;
}

// The same with `loaded`: whether the first result has come, so a screen shows its empty state
// only when the data says so, not while the first read runs.
export function useLiveQueryState<T, I = T>(
  query: () => T | Promise<T>,
  initial: I,
  deps?: WatchSource,
): { data: Ref<T | I>; loaded: Ref<boolean> } {
  const data = shallowRef<T | I>(initial);
  const loaded = shallowRef(false);
  let subscription: Subscription | null = null;
  const subscribe = () => {
    subscription?.unsubscribe();
    subscription = liveQuery(query).subscribe({
      next: (value) => {
        data.value = value;
        loaded.value = true;
      },
      error: (error: unknown) => console.error(error),
    });
  };
  subscribe();
  if (deps) watch(deps, subscribe);
  onScopeDispose(() => subscription?.unsubscribe());
  return { data, loaded };
}
