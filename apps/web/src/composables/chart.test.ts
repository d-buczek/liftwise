import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { defineComponent, h, nextTick, ref, type Ref } from 'vue';
import { useChartChoice, useElementWidth } from './chart';

enableAutoUnmount(afterEach);

class FakeResizeObserver {
  static last: FakeResizeObserver | null = null;
  observed: Element[] = [];
  disconnected = false;

  constructor(private readonly callback: (entries: unknown[]) => void) {
    FakeResizeObserver.last = this;
  }

  observe(element: Element) {
    this.observed.push(element);
  }

  unobserve() {}

  disconnect() {
    this.disconnected = true;
  }

  // Reports the box's size; a real observer stops calling back after `disconnect`.
  resize(width: number) {
    if (!this.disconnected) this.callback([{ contentRect: { width } }]);
  }
}

describe('useElementWidth', () => {
  beforeEach(() => vi.stubGlobal('ResizeObserver', FakeResizeObserver));
  afterEach(() => vi.unstubAllGlobals());

  function chartBox(fallback?: number) {
    let width!: Ref<number>;
    const wrapper = mount(
      defineComponent({
        setup() {
          const box = ref<HTMLElement | null>(null);
          width = useElementWidth(box, fallback);
          return () => h('div', { ref: box });
        },
      }),
    );
    const observer = FakeResizeObserver.last!;
    return { wrapper, width, observer };
  }

  it('draws at the fallback width until the first measure', () => {
    expect(chartBox().width.value).toBe(320);
    expect(chartBox(500).width.value).toBe(500);
  });

  it("follows the box's width in whole pixels", () => {
    const { wrapper, width, observer } = chartBox();
    expect(observer.observed).toEqual([wrapper.element]);
    observer.resize(412.6);
    expect(width.value).toBe(413);
    observer.resize(280);
    expect(width.value).toBe(280);
  });

  it('never draws narrower than 200, also for a hidden box of width 0', () => {
    const { width, observer } = chartBox();
    observer.resize(120);
    expect(width.value).toBe(200);
    observer.resize(0);
    expect(width.value).toBe(200);
  });

  it('stops observing when the chart goes away', () => {
    const { wrapper, observer } = chartBox();
    expect(observer.disconnected).toBe(false);
    wrapper.unmount();
    expect(observer.disconnected).toBe(true);
  });
});

describe('useChartChoice', () => {
  function chart(length = 4) {
    const marks = ref(Array.from({ length }, (_, index) => index));
    return { marks, ...useChartChoice(() => marks.value) };
  }

  function press(key: string, handler: (event: KeyboardEvent) => void) {
    const event = new KeyboardEvent('keydown', { key, cancelable: true });
    handler(event);
    return event;
  }

  it('starts at the last mark', () => {
    const { selected, chosen } = chart();
    expect(selected.value).toBe(3);
    expect(chosen.value).toBeNull();
  });

  it('moves with the arrows and stops at both ends', () => {
    const { selected, key } = chart();
    press('ArrowRight', key);
    expect(selected.value).toBe(3);
    press('ArrowLeft', key);
    press('ArrowLeft', key);
    expect(selected.value).toBe(1);
    press('ArrowLeft', key);
    press('ArrowLeft', key);
    expect(selected.value).toBe(0);
    press('ArrowRight', key);
    expect(selected.value).toBe(1);
  });

  it('jumps to the ends with Home and End', () => {
    const { selected, key } = chart();
    press('Home', key);
    expect(selected.value).toBe(0);
    press('End', key);
    expect(selected.value).toBe(3);
  });

  it("takes over only its keys: the page keeps Tab and doesn't scroll on an arrow", () => {
    const { chosen, key } = chart();
    expect(press('ArrowLeft', key).defaultPrevented).toBe(true);
    const before = chosen.value;
    expect(press('Tab', key).defaultPrevented).toBe(false);
    expect(chosen.value).toBe(before);
  });

  it('new data starts over at the last mark, whatever was chosen', async () => {
    const { marks, selected, key } = chart();
    press('Home', key);
    marks.value = [0, 1, 2, 3, 4, 5];
    await nextTick();
    expect(selected.value).toBe(5);
  });

  it('a mouse leaving gives the readout back to the last mark; a finger keeps its choice', () => {
    const { selected, key, leave } = chart();
    press('Home', key);
    leave({ pointerType: 'touch' } as PointerEvent);
    expect(selected.value).toBe(0);
    leave({ pointerType: 'mouse' } as PointerEvent);
    expect(selected.value).toBe(3);
  });
});
