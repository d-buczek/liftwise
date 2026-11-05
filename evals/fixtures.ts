import { newId, SETTING_IDS, seedCatalog, type SyncMutationInput } from '@liftwise/core';
import { expect } from 'vite-plus/test';
import { push, upsert } from '../apps/api/test/helpers';
import { done, pushDay } from '../apps/api/test/tools';

// The made-up athlete every case starts from: 40 kg dumbbells, a bench and three weeks of an A / B
// split. Now is a Friday, so "czwartek" (yesterday) and "sobota" (tomorrow) mean one day each.

export const NOW = '2026-10-30T18:00:00+01:00';
export const TODAY = '2026-10-30';
export const THURSDAY = '2026-10-29';
export const SATURDAY = '2026-10-31';

const catalog = seedCatalog();

function exerciseId(name: string): string {
  const exercise = catalog.find((row) => row.name_pl === name);
  if (!exercise) throw new Error(`no exercise ${name}`);
  return exercise.id;
}

export const EX = {
  bench: exerciseId('Wyciskanie hantli na ławce płaskiej'),
  floorPress: exerciseId('Wyciskanie hantli leżąc na podłodze'),
  pushUp: exerciseId('Pompki'),
  oneArmRow: exerciseId('Wiosłowanie hantlą jednorącz'),
  bentRow: exerciseId('Wiosłowanie hantlami w opadzie tułowia'),
  seatedPress: exerciseId('Wyciskanie hantli nad głowę siedząc'),
  arnold: exerciseId('Arnoldki'),
  lateral: exerciseId('Unoszenie hantli bokiem'),
  hammer: exerciseId('Uginanie młotkowe'),
  goblet: exerciseId('Przysiad goblet'),
  hipThrust: exerciseId('Hip thrust z hantlą'),
  plank: exerciseId('Deska'),
};

const reps = (date: string, exercise_id: string, weight_kg: number, count: number, times = 3) =>
  Array.from({ length: times }, (_, index) =>
    done({
      exercise_id,
      weight_kg,
      reps: count,
      performed_at: `${date}T18:0${index}:00+01:00`,
    }),
  );

const timed = (date: string, duration_s: number, times = 3) =>
  Array.from({ length: times }, (_, index) =>
    done({
      exercise_id: EX.plank,
      weight_kg: 0,
      reps: null,
      duration_s,
      performed_at: `${date}T18:3${index}:00+01:00`,
    }),
  );

// Everything a case has before its first message; the models come first, so a turn finds them.
export async function seedAthlete(token: string, models: unknown) {
  const mutations: SyncMutationInput[] = [
    upsert('settings', { id: SETTING_IDS.models, key: 'models', value: models }),
    upsert('equipment_items', { id: newId(), type: 'dumbbells', props: { max_kg: 40 } }),
    upsert('equipment_items', {
      id: newId(),
      type: 'bench',
      props: { incline: true, decline: false },
    }),
  ];
  expect((await push(token, mutations)).status).toBe(200);

  await pushDay(token, '2026-10-20', [
    ...reps('2026-10-20', EX.bench, 26, 8),
    ...reps('2026-10-20', EX.oneArmRow, 28, 10),
    ...reps('2026-10-20', EX.lateral, 8.75, 15),
  ]);
  await pushDay(token, '2026-10-22', [
    ...reps('2026-10-22', EX.seatedPress, 16, 10),
    ...reps('2026-10-22', EX.bentRow, 24, 10),
    ...reps('2026-10-22', EX.hammer, 12, 10),
    ...timed('2026-10-22', 45),
  ]);
  await pushDay(token, '2026-10-27', [
    ...reps('2026-10-27', EX.bench, 28, 8),
    ...reps('2026-10-27', EX.oneArmRow, 30, 10),
    ...reps('2026-10-27', EX.lateral, 8.75, 15),
  ]);
  await pushDay(token, THURSDAY, [
    ...reps(THURSDAY, EX.seatedPress, 17.5, 10),
    ...reps(THURSDAY, EX.bentRow, 26, 10),
    ...reps(THURSDAY, EX.hammer, 14, 10),
    ...timed(THURSDAY, 60),
  ]);
}

// Set ids a case can name in its expected calls. Fixed: logged by hand minutes apart, they have
// little in common, unlike the ids of one `log_sets` call or of `newId()` in one millisecond.
export const SET = {
  benchFirst: '01a18d93-419d-721f-be4e-dca22885ce2b',
  benchSecond: '01a18d97-e1d7-701f-ad35-058b1ee45aed',
  benchLast: '01a18d9c-715b-774d-a296-17cb75815171',
  rowFirst: '01a18d95-1b6f-738d-8d7a-3f26f60691c8',
  rowLast: '01a18da1-0547-76ae-9043-0ae3d43a03eb',
};

const benchToday = (id: string, minute: number) =>
  done({
    id,
    exercise_id: EX.bench,
    weight_kg: 24,
    reps: 10,
    performed_at: `${TODAY}T17:${minute}:00+01:00`,
  });

const rowToday = (id: string, minute: number) =>
  done({
    id,
    exercise_id: EX.oneArmRow,
    weight_kg: 30,
    reps: 10,
    performed_at: `${TODAY}T17:${minute}:00+01:00`,
  });

const started = { started_at: `${TODAY}T17:00:00+01:00` };

// Today one exercise is in progress: "ostatnia seria" is clear.
export const oneExerciseToday = async (token: string) => {
  await pushDay(
    token,
    TODAY,
    [
      benchToday(SET.benchFirst, 10),
      benchToday(SET.benchSecond, 15),
      benchToday(SET.benchLast, 20),
    ],
    started,
  );
};

// Today two exercises are in progress, in turns: "ostatnia seria" is not clear (§5.9.2).
export const twoExercisesToday = async (token: string) => {
  await pushDay(
    token,
    TODAY,
    [
      benchToday(SET.benchFirst, 10),
      rowToday(SET.rowFirst, 15),
      benchToday(SET.benchLast, 20),
      rowToday(SET.rowLast, 25),
    ],
    started,
  );
};

// Today one exercise is done, then another: "ostatnia seria" is the latest set.
export const exercisesInSequenceToday = async (token: string) => {
  await pushDay(
    token,
    TODAY,
    [
      benchToday(SET.benchFirst, 10),
      benchToday(SET.benchLast, 15),
      rowToday(SET.rowFirst, 20),
      rowToday(SET.rowLast, 25),
    ],
    started,
  );
};

export const plannedToday = async (token: string) => {
  await pushDay(token, TODAY, [
    { exercise_id: EX.bench, weight_kg: 24, reps: 10 },
    { exercise_id: EX.bench, weight_kg: 24, reps: 10 },
  ]);
};

export const plannedSaturday = async (token: string) => {
  await pushDay(token, SATURDAY, [
    { exercise_id: EX.goblet, weight_kg: 20, reps: 12 },
    { exercise_id: EX.goblet, weight_kg: 20, reps: 12 },
  ]);
};
