import { describe, expect, it } from 'vite-plus/test';
import { checkinMessage } from './checkin';

const DATE = '2026-11-05';

describe('checkinMessage', () => {
  it('asks for the day with no answers given', () => {
    expect(checkinMessage(DATE, { timeMin: null, wellbeing: null, pain: [], note: '  ' })).toBe(
      'Zaproponuj trening na 2026-11-05.',
    );
  });

  it('puts every answer in the message', () => {
    expect(
      checkinMessage(DATE, {
        timeMin: 30,
        wellbeing: 3,
        pain: ['shoulder', 'lowerBack'],
        note: ' boli przy wyciskaniu ',
      }),
    ).toBe(
      'Zaproponuj trening na 2026-11-05. Czas: 30 min. Samopoczucie: 3/5. ' +
        'Ból lub ograniczenia: bark, dół pleców, boli przy wyciskaniu.',
    );
  });

  it('keeps the last time chip open-ended', () => {
    expect(checkinMessage(DATE, { timeMin: 60, wellbeing: null, pain: [], note: '' })).toBe(
      'Zaproponuj trening na 2026-11-05. Czas: 60+ min.',
    );
  });
});
