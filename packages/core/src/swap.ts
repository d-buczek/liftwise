import { isWorkingSet } from './conventions';
import type { DatedSet } from './history';
import type { EquipmentItem } from './schemas/equipment';
import type { Exercise } from './schemas/exercise';

// Available when every equipment type the exercise requires is in the profile (§5.6).
export function isExerciseAvailable(
  exercise: Pick<Exercise, 'requires'>,
  equipment: Pick<EquipmentItem, 'type'>[],
): boolean {
  const types = new Set(equipment.map((item) => item.type));
  return exercise.requires.every((type) => types.has(type));
}

export type SwapSuggestionsInput = {
  exercise: Exercise;
  catalog: Exercise[];
  equipment: Pick<EquipmentItem, 'type'>[];
  sets: DatedSet[];
};

// Similar exercises for "Zamień" (§5.2): available, not archived, the same measure (the sets
// stay on a swap) and at least one shared primary muscle. Ranked by shared primary muscles,
// shared patterns, then most recent use; the rest of the picker list is up to the UI.
export function swapSuggestions({
  exercise,
  catalog,
  equipment,
  sets,
}: SwapSuggestionsInput): Exercise[] {
  const lastUsed = new Map<string, string>();
  for (const set of sets) {
    if (isWorkingSet(set) && set.date > (lastUsed.get(set.exercise_id) ?? '')) {
      lastUsed.set(set.exercise_id, set.date);
    }
  }
  return catalog
    .filter(
      (candidate) =>
        candidate.id !== exercise.id &&
        !candidate.archived &&
        candidate.measure === exercise.measure &&
        isExerciseAvailable(candidate, equipment),
    )
    .map((candidate) => ({
      candidate,
      muscles: countShared(candidate.primary_muscles, exercise.primary_muscles),
      patterns: countShared(candidate.patterns, exercise.patterns),
      lastUsed: lastUsed.get(candidate.id) ?? '',
    }))
    .filter((ranked) => ranked.muscles > 0)
    .sort(
      (a, b) =>
        b.muscles - a.muscles ||
        b.patterns - a.patterns ||
        b.lastUsed.localeCompare(a.lastUsed) ||
        a.candidate.name_pl.localeCompare(b.candidate.name_pl, 'pl'),
    )
    .map((ranked) => ranked.candidate);
}

function countShared<T>(a: T[], b: T[]): number {
  return a.filter((value) => b.includes(value)).length;
}
