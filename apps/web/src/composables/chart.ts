import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

// The rendered width of a chart's box, so its SVG draws at 1:1 and text keeps its size.
export function useElementWidth(element: Ref<HTMLElement | null>, fallback = 320) {
  const width = ref(fallback);
  let observer: ResizeObserver | null = null;
  onMounted(() => {
    observer = new ResizeObserver(([entry]) => {
      if (entry) width.value = Math.max(200, Math.round(entry.contentRect.width));
    });
    if (element.value) observer.observe(element.value);
  });
  onBeforeUnmount(() => observer?.disconnect());
  return width;
}

// The chosen mark of a chart: the last one until a pointer or the arrow keys choose another;
// new data starts over at the last.
export function useChartChoice(marks: () => unknown[]) {
  const chosen = ref<number | null>(null);
  watch(marks, () => (chosen.value = null));
  const selected = computed(() => chosen.value ?? marks().length - 1);

  function key(event: KeyboardEvent) {
    const last = marks().length - 1;
    const next = {
      ArrowLeft: Math.max(0, selected.value - 1),
      ArrowRight: Math.min(last, selected.value + 1),
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    chosen.value = next;
  }

  // A mouse leaving gives the readout back to the last mark; a tap keeps its choice.
  function leave(event: PointerEvent) {
    if (event.pointerType === 'mouse') chosen.value = null;
  }

  return { chosen, selected, key, leave };
}
