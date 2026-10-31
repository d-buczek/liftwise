import { compareHistory, exerciseHistory, type DatedSet } from './history';
import type { Exercise } from './schemas/exercise';
import { setValue } from './schemas/set';

export type RecordKind = 'reps' | 'time' | 'e1rm';

export type RecordEvent = {
  set_id: string;
  exercise_id: string;
  date: string;
  kind: RecordKind;
  weight_kg: number;
  value: number;
};

export type RecordEntry = { weight_kg: number; value: number; set_id: string; date: string };

// Epley, per dumbbell; not rounded (the UI formats it).
export function e1rm(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

// New records of working sets in chronological order (§5.4). A rep (time) record: no earlier
// set has at least the weight and at least the reps (seconds). An e1RM record: above every
// earlier e1RM, reps exercises above 0 kg only. The first workout of an exercise is the baseline
// and sets no records.
export function recordSets(sets: DatedSet[], exercises: Exercise[]): RecordEvent[] {
  return exercises
    .flatMap((exercise) => replayRecords(sets, exercise).events)
    .sort((a, b) => compareHistory(a.set, b.set))
    .map(({ event }) => event);
}

// The record per weight: sets no other set beats on both weight and value, by weight ascending.
export function recordTable(sets: DatedSet[], exercise: Exercise): RecordEntry[] {
  return replayRecords(sets, exercise).table.sort((a, b) => a.weight_kg - b.weight_kg);
}

// The best e1RM ever (`value`) and its set; null for timed exercises or without a set above 0 kg.
export function bestE1rm(sets: DatedSet[], exercise: Exercise): RecordEntry | null {
  return replayRecords(sets, exercise).best;
}

// Replays the exercise's history; on a tie the earlier set keeps the record.
function replayRecords(sets: DatedSet[], exercise: Exercise) {
  const history = exerciseHistory(sets, exercise);
  const baseline = history[0]?.workout_id;
  let table: RecordEntry[] = [];
  let best: RecordEntry | null = null;
  const events: { set: DatedSet; event: RecordEvent }[] = [];
  const record = (set: DatedSet, kind: RecordKind, value: number) => {
    if (set.workout_id === baseline) return;
    events.push({
      set,
      event: {
        set_id: set.id,
        exercise_id: set.exercise_id,
        date: set.date,
        kind,
        weight_kg: set.weight_kg,
        value,
      },
    });
  };

  for (const set of history) {
    const entry = {
      weight_kg: set.weight_kg,
      value: setValue(set),
      set_id: set.id,
      date: set.date,
    };
    if (!table.some((r) => r.weight_kg >= entry.weight_kg && r.value >= entry.value)) {
      table = table.filter((r) => r.weight_kg > entry.weight_kg || r.value > entry.value);
      table.push(entry);
      record(set, exercise.measure === 'time' ? 'time' : 'reps', entry.value);
    }
    if (exercise.measure === 'reps' && set.weight_kg > 0) {
      const estimate = e1rm(set.weight_kg, entry.value);
      if (!best || estimate > best.value) {
        best = { ...entry, value: estimate };
        record(set, 'e1rm', estimate);
      }
    }
  }
  return { events, table, best };
}
