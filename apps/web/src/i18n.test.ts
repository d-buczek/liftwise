import { describe, expect, it } from 'vite-plus/test';
import { i18n, polishPluralIndex } from './i18n';

describe('Polish plurals', () => {
  it('picks one, few or many', () => {
    expect([1, 2, 4, 5, 12, 22, 25, 101, 112].map((n) => polishPluralIndex(n, 3))).toEqual([
      0, 1, 1, 2, 2, 1, 2, 2, 2,
    ]);
  });

  it('puts zero first in a message with four forms', () => {
    expect([0, 1, 3, 7].map((n) => polishPluralIndex(n, 4))).toEqual([0, 1, 2, 3]);
  });

  it('formats the queued changes', () => {
    const { t } = i18n.global;
    expect([0, 1, 2, 5, 22].map((n) => t('sync.pending', n))).toEqual([
      'Wszystko wysłane',
      '1 zmiana czeka na wysłanie',
      '2 zmiany czekają na wysłanie',
      '5 zmian czeka na wysłanie',
      '22 zmiany czekają na wysłanie',
    ]);
  });
});
