import { describe, expect, it } from 'vite-plus/test';
import { withShortIds } from './model-output';

const ID = '01a18d97-e1d7-701f-ad35-058b1ee45aed';

describe('what the model sees of a tool output', () => {
  it('shortens ids everywhere, also in lists and nested rows', () => {
    expect(
      withShortIds({
        groupId: ID,
        set_ids: [ID],
        changes: [{ id: ID, after: { id: ID, workout_id: ID, weight_kg: 22 } }],
      }),
    ).toEqual({
      groupId: '1ee45aed',
      set_ids: ['1ee45aed'],
      changes: [
        { id: '1ee45aed', after: { id: '1ee45aed', workout_id: '1ee45aed', weight_kg: 22 } },
      ],
    });
  });

  it('keeps exercise ids as the catalog in the prompt lists them', () => {
    expect(withShortIds({ exercise_id: ID, to_exercise_id: ID })).toEqual({
      exercise_id: ID,
      to_exercise_id: ID,
    });
  });

  it('leaves everything else alone', () => {
    const output = {
      note: `zobacz ${ID}`,
      date: '2026-10-30',
      weight_kg: 22,
      done: true,
      rir: null,
      nothing: undefined,
    };
    expect(withShortIds(output)).toEqual(output);
  });
});
