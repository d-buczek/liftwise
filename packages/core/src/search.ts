import type { Exercise } from './schemas/exercise';

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
