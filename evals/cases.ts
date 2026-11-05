import {
  EX,
  exercisesInSequenceToday,
  oneExerciseToday,
  plannedSaturday,
  plannedToday,
  SATURDAY,
  SET,
  THURSDAY,
  TODAY,
  twoExercisesToday,
} from './fixtures';
import { any, anyOf, text, unordered, type Turn, type TurnExpectation } from './score';

// Polish utterances → expected tool calls (§5.9.2, §5.9.3, §7). Each case starts from the athlete
// in fixtures.ts on a clean database; more turns continue one thread.

export type EvalCase = {
  id: string;
  group:
    | 'logging'
    | 'edits'
    | 'copy and plan'
    | 'unclear'
    | 'weight over limit'
    | 'risky'
    | 'history';
  fixture?: (token: string) => Promise<void>;
  turns: { say: string; expect: TurnExpectation }[];
};

const sets = (times: number, set: Record<string, unknown>) =>
  Array.from({ length: times }, () => set);

// Left out or given, a call about today must not land on another day.
const todayOrNone = anyOf(undefined, TODAY);

const logged = (exercise_id: string, ...setList: Record<string, unknown>[]) => ({
  calls: [{ tool: 'log_sets', input: { exercise_id, date: todayOrNone, sets: setList } }],
});

const asks = { question: true };

const anyRange = { from: any(THURSDAY), to: any(THURSDAY) };

const lastWrite = (previous: Turn[]) =>
  previous.at(-1)?.calls.find((call) => call.risk === 'write')?.output as
    | { groupId?: string; changes?: { entity: string; id: string }[] }
    | undefined;

const groupOfLastWrite = (previous: Turn[]) => ({ group_id: lastWrite(previous)?.groupId });

const setsOfLastWrite = (previous: Turn[]) =>
  (lastWrite(previous)?.changes ?? [])
    .filter((change) => change.entity === 'sets')
    .map((change) => change.id);

export const CASES: EvalCase[] = [
  // --- Logging variants: a clear sentence is written at once ---------------------------------
  {
    id: 'log-basic',
    group: 'logging',
    turns: [
      {
        say: 'wyciskanie na płaskiej 24 kg 4x10',
        expect: logged(EX.bench, ...sets(4, { weight_kg: 24, reps: 10 })),
      },
    ],
  },
  {
    id: 'log-rir',
    group: 'logging',
    turns: [
      {
        say: 'wyciskanie na płaskiej 24 kg 4x10, ostatnia na zero',
        // Only the last set has a RIR: the others must not get it too.
        expect: logged(EX.bench, ...sets(3, { weight_kg: 24, reps: 10, rir: undefined }), {
          weight_kg: 24,
          reps: 10,
          rir: 0,
        }),
      },
    ],
  },
  {
    id: 'log-timed',
    group: 'logging',
    turns: [
      {
        say: 'plank 3x45 s',
        expect: logged(EX.plank, ...sets(3, { weight_kg: 0, duration_s: 45 })),
      },
    ],
  },
  {
    id: 'log-timed-words',
    group: 'logging',
    turns: [{ say: 'deska 60 sekund', expect: logged(EX.plank, { weight_kg: 0, duration_s: 60 }) }],
  },
  {
    id: 'log-varied-reps',
    group: 'logging',
    turns: [
      {
        say: 'młotki 14 kilo 10, 9 i 8',
        expect: logged(
          EX.hammer,
          { weight_kg: 14, reps: 10 },
          { weight_kg: 14, reps: 9 },
          { weight_kg: 14, reps: 8 },
        ),
      },
    ],
  },
  {
    id: 'log-decimal',
    group: 'logging',
    turns: [
      {
        say: 'unoszenie bokiem 8,75 kg 3x15',
        expect: logged(EX.lateral, ...sets(3, { weight_kg: 8.75, reps: 15 })),
      },
    ],
  },
  {
    id: 'log-bodyweight',
    group: 'logging',
    turns: [
      { say: 'pompki 3x15', expect: logged(EX.pushUp, ...sets(3, { weight_kg: 0, reps: 15 })) },
    ],
  },
  {
    id: 'log-yesterday',
    group: 'logging',
    turns: [
      {
        say: 'wczoraj arnoldki 12 kg 3x10',
        expect: {
          calls: [
            {
              tool: 'log_sets',
              input: {
                exercise_id: EX.arnold,
                date: THURSDAY,
                sets: sets(3, { weight_kg: 12, reps: 10 }),
              },
            },
          ],
        },
      },
    ],
  },
  {
    id: 'log-mistranscribed-floor',
    group: 'logging',
    turns: [
      {
        say: 'flor pres 20 kg 3x8',
        expect: logged(EX.floorPress, ...sets(3, { weight_kg: 20, reps: 8 })),
      },
    ],
  },
  {
    id: 'log-mistranscribed-hip',
    group: 'logging',
    turns: [
      {
        say: 'hip trust 30 kg 3 serie po 12',
        expect: logged(EX.hipThrust, ...sets(3, { weight_kg: 30, reps: 12 })),
      },
    ],
  },

  // --- Edits and undo ------------------------------------------------------------------------
  {
    id: 'edit-last-set',
    group: 'edits',
    fixture: oneExerciseToday,
    turns: [
      {
        say: 'zmień ostatnią serię na 22 kg',
        expect: {
          calls: [{ tool: 'update_set', input: { set_id: SET.benchLast, weight_kg: 22 } }],
        },
      },
    ],
  },
  {
    // One exercise after another is not the alternating sets of `ask-which-last-set`.
    id: 'edit-last-set-after-another-exercise',
    group: 'edits',
    fixture: exercisesInSequenceToday,
    turns: [
      {
        say: 'zmień ostatnią serię na 22 kg',
        expect: {
          calls: [{ tool: 'update_set', input: { set_id: SET.rowLast, weight_kg: 22 } }],
        },
      },
    ],
  },
  {
    id: 'edit-several-sets',
    group: 'edits',
    fixture: oneExerciseToday,
    turns: [
      {
        say: 'zmień wszystkie dzisiejsze serie wyciskania na 22 kg',
        expect: {
          calls: [
            {
              tool: 'update_sets',
              input: {
                updates: unordered(
                  [SET.benchFirst, SET.benchSecond, SET.benchLast].map((set_id) => ({
                    set_id,
                    weight_kg: 22,
                  })),
                ),
              },
            },
          ],
        },
      },
    ],
  },
  {
    // Sets of one call have ids of one millisecond, nearly identical.
    id: 'edit-sets-just-logged',
    group: 'edits',
    turns: [
      {
        say: 'wyciskanie na płaskiej 24 kg 3x10',
        expect: logged(EX.bench, ...sets(3, { weight_kg: 24, reps: 10 })),
      },
      {
        say: 'pomyłka, wszystkie te serie były na 22 kg',
        expect: {
          calls: [
            {
              tool: 'update_sets',
              input: (previous) => ({
                updates: unordered(
                  setsOfLastWrite(previous).map((set_id) => ({ set_id, weight_kg: 22 })),
                ),
              }),
            },
          ],
        },
      },
    ],
  },
  {
    id: 'undo-after-log',
    group: 'edits',
    turns: [
      {
        say: 'wyciskanie na płaskiej 24 kg 3x10',
        expect: logged(EX.bench, ...sets(3, { weight_kg: 24, reps: 10 })),
      },
      { say: 'cofnij to', expect: { calls: [{ tool: 'undo_change', input: groupOfLastWrite }] } },
    ],
  },

  // --- Copying and planning ------------------------------------------------------------------
  {
    id: 'copy',
    group: 'copy and plan',
    turns: [
      {
        say: 'skopiuj czwartek na sobotę',
        expect: {
          calls: [
            {
              tool: 'copy_workout',
              input: { from_date: THURSDAY, to_date: SATURDAY, light: undefined },
            },
          ],
        },
      },
    ],
  },
  {
    id: 'copy-light',
    group: 'copy and plan',
    turns: [
      {
        say: 'skopiuj czwartek na sobotę, ale lżej',
        expect: {
          calls: [
            {
              tool: 'copy_workout',
              input: { from_date: THURSDAY, to_date: SATURDAY, light: true },
            },
          ],
        },
      },
    ],
  },
  {
    id: 'copy-with-swap',
    group: 'copy and plan',
    turns: [
      {
        say: 'skopiuj czwartek na sobotę, zamiast wiosłowania daj wiosłowanie jednorącz',
        expect: {
          calls: [
            { tool: 'copy_workout', input: { from_date: THURSDAY, to_date: SATURDAY } },
            {
              tool: 'edit_planned_sets',
              input: {
                date: SATURDAY,
                swap: [{ exercise_id: EX.bentRow, to_exercise_id: EX.oneArmRow }],
              },
            },
          ],
        },
      },
    ],
  },
  {
    id: 'plan-add',
    group: 'copy and plan',
    turns: [
      {
        say: 'dodaj na sobotę uginanie młotkowe 14 kg 3x10',
        expect: {
          calls: [
            {
              tool: 'edit_planned_sets',
              input: {
                date: SATURDAY,
                add: [{ exercise_id: EX.hammer, sets: sets(3, { weight_kg: 14, reps: 10 }) }],
              },
            },
          ],
        },
      },
    ],
  },
  {
    id: 'workout-start',
    group: 'copy and plan',
    fixture: plannedToday,
    turns: [
      {
        say: 'zaczynam trening',
        expect: { calls: [{ tool: 'start_workout', input: { date: todayOrNone } }] },
      },
    ],
  },
  {
    id: 'workout-finish',
    group: 'copy and plan',
    fixture: oneExerciseToday,
    turns: [
      {
        say: 'kończę trening',
        expect: { calls: [{ tool: 'finish_workout', input: { date: todayOrNone } }] },
      },
    ],
  },

  // --- Unclear: ask and write nothing --------------------------------------------------------
  {
    id: 'ask-which-press',
    group: 'unclear',
    turns: [
      { say: 'wyciskanie 24 kg 4x10', expect: asks },
      {
        say: 'na płaskiej',
        expect: logged(EX.bench, ...sets(4, { weight_kg: 24, reps: 10 })),
      },
    ],
  },
  {
    id: 'ask-which-row',
    group: 'unclear',
    turns: [{ say: 'wiosłowanie 30 kg 3x10', expect: asks }],
  },
  {
    id: 'ask-missing-sets',
    group: 'unclear',
    turns: [{ say: 'wyciskanie na płaskiej 24 kg', expect: asks }],
  },
  {
    id: 'ask-missing-reps-and-weight',
    group: 'unclear',
    turns: [{ say: 'zrobiłem rumuński martwy ciąg, 3 serie', expect: asks }],
  },
  {
    id: 'ask-unknown-exercise',
    group: 'unclear',
    turns: [{ say: 'podciąganie na drążku 3x8', expect: asks }],
  },
  {
    id: 'ask-which-last-set',
    group: 'unclear',
    fixture: twoExercisesToday,
    turns: [{ say: 'zmień ostatnią serię na 22 kg', expect: asks }],
  },

  // --- A weight above the 40 kg dumbbells: ask, then log what the user confirms --------------
  {
    id: 'weight-sum-of-both',
    group: 'weight over limit',
    turns: [
      { say: 'wyciskanie na płaskiej 80 kg 3x10', expect: asks },
      {
        say: 'to było razem, 40 na hantlę',
        expect: logged(EX.bench, ...sets(3, { weight_kg: 40, reps: 10 })),
      },
    ],
  },
  {
    id: 'weight-gym-confirmed',
    group: 'weight over limit',
    turns: [
      { say: 'wiosłowanie jednorącz 50 kg 3x10', expect: asks },
      {
        say: 'tak, 50 kg na hantlę, robiłem to na siłowni',
        expect: logged(EX.oneArmRow, ...sets(3, { weight_kg: 50, reps: 10 })),
      },
    ],
  },

  // --- Risky: a proposal, nothing written until "Zatwierdź" ----------------------------------
  {
    id: 'risky-delete-sets',
    group: 'risky',
    fixture: twoExercisesToday,
    turns: [
      {
        say: 'usuń dzisiejsze serie wyciskania',
        expect: {
          calls: [
            { tool: 'delete_sets', input: { set_ids: unordered([SET.benchFirst, SET.benchLast]) } },
          ],
        },
      },
    ],
  },
  {
    id: 'risky-create-exercise',
    group: 'risky',
    turns: [
      {
        say: 'dodaj do katalogu nowe ćwiczenie: podciąganie na drążku',
        expect: {
          calls: [
            {
              tool: 'create_exercise',
              input: {
                name_pl: text(/podci[aą]gani/i, 'Podciąganie na drążku'),
                measure: 'reps',
                primary_muscles: any(['lats']),
                patterns: any(['vertical_pull']),
                implements: any(1),
                unilateral: any(false),
                range_min: any(5),
                range_max: any(10),
              },
            },
          ],
        },
      },
    ],
  },
  {
    id: 'risky-update-exercise',
    group: 'risky',
    turns: [
      {
        say: 'zmień krok ciężaru w wyciskaniu na płaskiej na 2,5 kg',
        expect: {
          calls: [
            { tool: 'update_exercise', input: { exercise_id: EX.bench, weight_step_kg: 2.5 } },
          ],
        },
      },
    ],
  },
  {
    id: 'risky-update-profile',
    group: 'risky',
    turns: [
      {
        say: 'zapisz w profilu, że wolę trenować rano',
        expect: {
          calls: [
            {
              tool: 'update_profile',
              input: { content: text(/rano|porann/i, 'Woli trenować rano.') },
            },
          ],
        },
      },
    ],
  },
  {
    id: 'risky-update-settings',
    group: 'risky',
    turns: [
      {
        say: 'ustaw domyślną przerwę na 2,5 minuty',
        expect: {
          calls: [{ tool: 'update_settings', input: { training: { rest_seconds: 150 } } }],
        },
      },
    ],
  },
  {
    // The only case on the `planner` model: what goes to it and that it gives a valid plan.
    id: 'risky-propose-workout',
    group: 'risky',
    turns: [
      {
        say: 'zaproponuj mi trening, mam 30 minut',
        expect: { calls: [{ tool: 'propose_workout', input: { time_min: 30 } }] },
      },
      {
        say: 'zrób krótszy, mam jednak tylko 20 minut',
        expect: {
          calls: [
            { tool: 'propose_workout', input: { change_request: any('Krótszy, 20 minut.') } },
          ],
        },
      },
    ],
  },

  // --- History: answered from the tools, written nowhere -------------------------------------
  {
    // Thursday's bent-over row (26 kg) is newer than Tuesday's one-arm row (30 kg).
    id: 'history-all-variants',
    group: 'history',
    turns: [
      {
        say: 'kiedy ostatnio robiłem wiosłowanie i z jakim ciężarem?',
        expect: {
          reads: [
            [
              { tool: 'get_exercise_history', input: { exercise_id: EX.bentRow } },
              { tool: 'get_workouts', input: anyRange },
            ],
          ],
          reply: text(/\b26\b/, 'Wczoraj: wiosłowanie w opadzie tułowia, 26 kg.'),
        },
      },
    ],
  },
  {
    id: 'history-record',
    group: 'history',
    turns: [
      {
        say: 'jaki mam rekord w wyciskaniu na płaskiej?',
        expect: {
          reads: [
            [
              { tool: 'get_records', input: { exercise_id: EX.bench } },
              { tool: 'get_exercise_history', input: { exercise_id: EX.bench } },
            ],
          ],
          reply: text(/\b28\b/, 'Najwięcej 28 kg na 8 powtórzeń.'),
        },
      },
    ],
  },
  {
    id: 'history-day',
    group: 'history',
    turns: [
      {
        say: 'co robiłem w czwartek?',
        expect: {
          reads: [{ tool: 'get_workouts', input: anyRange }],
          reply: text(/wiosłowani/i, 'Wyciskanie nad głową, wiosłowanie, młotki i deskę.'),
        },
      },
    ],
  },
  {
    id: 'history-planned-day',
    group: 'history',
    fixture: plannedSaturday,
    turns: [
      {
        say: 'co mam zaplanowane na sobotę?',
        expect: {
          reads: [{ tool: 'get_workouts', input: anyRange }],
          reply: text(/przysiad|goblet/i, 'Przysiad goblet, 2 serie po 12 z 20 kg.'),
        },
      },
    ],
  },
  {
    id: 'history-swap-options',
    group: 'history',
    turns: [
      {
        say: 'czym mogę zastąpić wyciskanie hantli nad głowę siedząc?',
        expect: {
          reads: [{ tool: 'get_swap_options', input: { exercise_id: EX.seatedPress } }],
        },
      },
    ],
  },
  {
    id: 'history-progression',
    group: 'history',
    turns: [
      {
        say: 'ile dołożyć w wyciskaniu na płaskiej następnym razem?',
        expect: { reads: [{ tool: 'get_progression_hints', input: {} }] },
      },
    ],
  },
  {
    id: 'history-week',
    group: 'history',
    turns: [
      {
        say: 'jak mi poszedł ten tydzień?',
        expect: {
          reads: [
            [
              { tool: 'get_weekly_summary', input: {} },
              { tool: 'get_workouts', input: anyRange },
            ],
          ],
        },
      },
    ],
  },
  {
    // Nothing logged: it says so instead of inventing a date.
    id: 'history-none',
    group: 'history',
    turns: [
      {
        say: 'kiedy ostatnio robiłem arnoldki?',
        expect: {
          reads: [
            [
              { tool: 'get_exercise_history', input: { exercise_id: EX.arnold } },
              { tool: 'get_records', input: { exercise_id: EX.arnold } },
            ],
          ],
          reply: text(/\b(nie|brak)\b/i, 'Nie ma ich jeszcze w Twojej historii.'),
        },
      },
    ],
  },
];
