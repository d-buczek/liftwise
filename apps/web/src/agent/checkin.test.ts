import { describe, expect, it } from 'vite-plus/test';
import { workoutRequestSchema } from '@liftwise/core';
import { checkinMessage, checkinRequest } from './checkin';

const DATE = '2026-11-05';

describe('checkinRequest', () => {
  it('leaves out what was not answered', () => {
    const request = checkinRequest(DATE, { timeMin: null, wellbeing: null, pain: [], note: '  ' });
    expect(JSON.parse(JSON.stringify(request))).toEqual({ date: DATE });
  });

  it('gives the answers as data the server accepts', () => {
    const request = checkinRequest(DATE, {
      timeMin: 60,
      wellbeing: 3,
      pain: ['shoulder', 'lowerBack'],
      note: ' boli przy wyciskaniu ',
    });
    expect(request).toEqual({
      date: DATE,
      time_min: 60,
      wellbeing: 3,
      pain: 'bark, dół pleców, boli przy wyciskaniu',
    });
    expect(workoutRequestSchema.safeParse(request).success).toBe(true);
  });
});

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
