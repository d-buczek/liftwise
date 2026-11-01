import {
  exerciseSessions,
  recordSets,
  type DatedSet,
  type Exercise,
  type RecordEvent,
  type WorkoutSet,
} from '@liftwise/core';
import type { ExerciseBlock } from './day';

// The active workout (§5.2): the draft of the next set and what "Zrobione" logs.

export type Load = Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_s' | 'warmup'>;
export type Draft = Load & Pick<WorkoutSet, 'rir'>;

// The exercise a workout opens on: the first one with a planned set left, else the first.
export function startExercise(blocks: ExerciseBlock[]): string | null {
  const open = blocks.find((block) => block.sets.some((set) => set.status === 'planned'));
  return (open ?? blocks[0])?.exerciseId ?? null;
}

export type DraftSource<S extends WorkoutSet> = {
  // The set "Zrobione" marks as done; null logs a new set.
  planned: S | null;
  // What "Jak poprzednio" repeats: the exercise's last done set of the day, else the first
  // working set of its last session.
  previous: Load | null;
  draft: Draft;
};

// `sets` are the exercise's sets of the day in position order.
export function draftSource<S extends WorkoutSet>(input: {
  exercise: Exercise | undefined;
  sets: S[];
  history: DatedSet[];
  date: string;
}): DraftSource<S> {
  const { exercise, sets, history, date } = input;
  const planned = sets.find((set) => set.status === 'planned') ?? null;
  const lastDone = sets.findLast((set) => set.status === 'done');
  const lastSession = exercise ? exerciseSessions(history, exercise, date).at(-1) : undefined;
  const previous = loadOf(lastDone ?? lastSession?.sets[0]);
  const base = loadOf(planned ?? undefined) ?? previous ?? firstLoad(exercise);
  return { planned, previous, draft: { ...base, rir: null } };
}

function loadOf(set: Load | undefined): Load | null {
  return set
    ? { weight_kg: set.weight_kg, reps: set.reps, duration_s: set.duration_s, warmup: set.warmup }
    : null;
}

// Without history: the bottom of the range at 0 kg, like a planned exercise. (An exercise
// missing from the catalog always has sets on the day it is opened from.)
function firstLoad(exercise: Exercise | undefined): Load {
  return exercise?.measure === 'time'
    ? { weight_kg: 0, reps: null, duration_s: exercise.time_range_s.min, warmup: false }
    : { weight_kg: 0, reps: exercise?.rep_range.min ?? 1, duration_s: null, warmup: false };
}

// The main button repeats the previous set while the draft still matches it.
export function repeatsPrevious(source: DraftSource<WorkoutSet>, draft: Draft): boolean {
  const { planned, previous } = source;
  return (
    planned === null &&
    previous !== null &&
    previous.weight_kg === draft.weight_kg &&
    previous.reps === draft.reps &&
    previous.duration_s === draft.duration_s &&
    previous.warmup === draft.warmup
  );
}

// A session as "22,5 kg × 10, 10, 9; 20 kg × 12": consecutive sets of one weight grouped.
export type LoadGroup = { weight_kg: number; values: number[]; timed: boolean };

export function loadGroups(sets: Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_s'>[]) {
  const groups: LoadGroup[] = [];
  for (const set of sets) {
    const timed = set.duration_s !== null;
    const value = set.duration_s ?? set.reps ?? 0;
    const last = groups.at(-1);
    if (last && last.weight_kg === set.weight_kg && last.timed === timed) last.values.push(value);
    else groups.push({ weight_kg: set.weight_kg, values: [value], timed });
  }
  return groups;
}

// The records a just logged set sets (§5.4): rep or time record, e1RM.
export function setRecords(history: DatedSet[], exercise: Exercise, setId: string): RecordEvent[] {
  return recordSets(history, [exercise]).filter((event) => event.set_id === setId);
}
