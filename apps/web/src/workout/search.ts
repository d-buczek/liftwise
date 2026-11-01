import {
  isExerciseAvailable,
  swapSuggestions,
  type DatedSet,
  type EquipmentItem,
  type Exercise,
} from '@liftwise/core';

// Lowercase without Polish diacritics, so "laweczka" finds "Ławeczka" (ł doesn't decompose).
export function foldText(text: string): string {
  return text
    .toLocaleLowerCase('pl')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replaceAll('ł', 'l')
    .trim();
}

// Every word of the query appears in the name or one alias.
export function matchesQuery(exercise: Pick<Exercise, 'name_pl' | 'aliases'>, query: string) {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  return [exercise.name_pl, ...exercise.aliases].some((name) => {
    const folded = foldText(name);
    return words.every((word) => folded.includes(word));
  });
}

export type PickerSection = {
  key: 'similar' | 'recent' | 'all' | 'unavailable';
  exercises: Exercise[];
};

export const RECENT_LIMIT = 5;

// The exercise picker (§5.2): for "Zamień" the similar exercises first, then recently done ones,
// the rest by name, and last the ones the equipment profile doesn't cover. A swap keeps the
// sets, so it lists the same measure only. Empty sections are left out.
export function pickerSections({
  catalog,
  equipment,
  sets,
  query,
  swapFor,
}: {
  catalog: Exercise[];
  equipment: Pick<EquipmentItem, 'type'>[];
  sets: DatedSet[];
  query: string;
  swapFor?: Exercise | null;
}): PickerSection[] {
  const shown = (exercise: Exercise) => matchesQuery(exercise, query);
  const candidates = catalog.filter(
    (exercise) =>
      !exercise.archived &&
      (!swapFor || (exercise.id !== swapFor.id && exercise.measure === swapFor.measure)),
  );
  const similar = swapFor
    ? swapSuggestions({ exercise: swapFor, catalog, equipment, sets }).filter(shown)
    : [];
  const taken = new Set(similar.map((exercise) => exercise.id));
  const byId = new Map(candidates.map((exercise) => [exercise.id, exercise]));

  const recent: Exercise[] = [];
  for (const set of [...sets].sort((a, b) => b.date.localeCompare(a.date))) {
    const exercise = byId.get(set.exercise_id);
    if (set.status !== 'done' || !exercise || taken.has(exercise.id) || !shown(exercise)) continue;
    recent.push(exercise);
    taken.add(exercise.id);
    if (recent.length === RECENT_LIMIT) break;
  }

  const rest = candidates
    .filter((exercise) => !taken.has(exercise.id) && shown(exercise))
    .sort((a, b) => a.name_pl.localeCompare(b.name_pl, 'pl'));
  const sections: PickerSection[] = [
    { key: 'similar', exercises: similar },
    { key: 'recent', exercises: recent },
    { key: 'all', exercises: rest.filter((exercise) => isExerciseAvailable(exercise, equipment)) },
    {
      key: 'unavailable',
      exercises: rest.filter((exercise) => !isExerciseAvailable(exercise, equipment)),
    },
  ];
  return sections.filter((section) => section.exercises.length > 0);
}
