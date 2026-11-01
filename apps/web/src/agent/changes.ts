import type { ChangeView, SyncEntity, WorkoutSet } from '@liftwise/core';

// What a change or confirmation card says (§5.9.2, §5.9.3): one line counting what happened,
// then a line per record.

export type ChangeKind =
  | 'setLogged'
  | 'setPlanned'
  | 'setChanged'
  | 'setDeleted'
  | 'workoutCreated'
  | 'workoutStarted'
  | 'workoutFinished'
  | 'workoutChanged'
  | 'workoutDeleted'
  | 'exerciseCreated'
  | 'exerciseChanged'
  | 'profileChanged'
  | 'settingsChanged'
  | 'other';

export type SetFields = Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_s' | 'status' | 'warmup'>;

export type ChangeLine =
  | {
      entity: 'sets';
      id: string;
      exerciseId: string;
      before: SetFields | null;
      after: SetFields | null;
    }
  | { entity: 'workouts'; id: string; date: string }
  | { entity: 'exercises'; id: string; name: string }
  | { entity: 'athlete_profile'; id: string; content: string }
  | { entity: 'settings'; id: string; key: string };

export type ChangeSummary = { counts: { kind: ChangeKind; count: number }[]; lines: ChangeLine[] };

type Fields = Record<string, unknown>;

const isSet = (fields: Fields | null): fields is Fields & SetFields & { exercise_id: string } =>
  fields !== null && typeof fields.exercise_id === 'string';

function kindOf({ entity, op, before, after }: ChangeView): ChangeKind {
  switch (entity) {
    case 'sets':
      if (op === 'delete') return 'setDeleted';
      if (after?.status === 'done' && before?.status !== 'done') return 'setLogged';
      return op === 'create' ? 'setPlanned' : 'setChanged';
    case 'workouts':
      if (op === 'delete') return 'workoutDeleted';
      if (after?.ended_at && !before?.ended_at) return 'workoutFinished';
      if (after?.started_at && !before?.started_at) return 'workoutStarted';
      return op === 'create' ? 'workoutCreated' : 'workoutChanged';
    case 'exercises':
      return op === 'create' ? 'exerciseCreated' : 'exerciseChanged';
    case 'athlete_profile':
      return 'profileChanged';
    case 'settings':
      return 'settingsChanged';
    default:
      return 'other';
  }
}

function lineOf({ entity, id, before, after }: ChangeView): ChangeLine | null {
  const fields = after ?? before;
  if (fields === null) return null;
  switch (entity) {
    case 'sets':
      return isSet(fields)
        ? {
            entity,
            id,
            exerciseId: fields.exercise_id,
            before: isSet(before) ? before : null,
            after: isSet(after) ? after : null,
          }
        : null;
    case 'workouts':
      return typeof fields.date === 'string' ? { entity, id, date: fields.date } : null;
    case 'exercises':
      return typeof fields.name_pl === 'string' ? { entity, id, name: fields.name_pl } : null;
    case 'athlete_profile':
      return typeof fields.content === 'string' ? { entity, id, content: fields.content } : null;
    case 'settings':
      return typeof fields.key === 'string' ? { entity, id, key: fields.key } : null;
    default:
      return null;
  }
}

const ENTITY_ORDER: SyncEntity[] = ['sets', 'workouts', 'exercises', 'athlete_profile', 'settings'];
const rank = (entity: SyncEntity) => {
  const index = ENTITY_ORDER.indexOf(entity);
  return index === -1 ? ENTITY_ORDER.length : index;
};

// Counts in the order the kinds first appear, sets first; a workout's lines only when no set
// changed (the sets already say which day it was).
export function changeSummary(changes: ChangeView[]): ChangeSummary {
  const ordered = [...changes].sort((a, b) => rank(a.entity) - rank(b.entity));
  const counts = new Map<ChangeKind, number>();
  for (const change of ordered) {
    const kind = kindOf(change);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const hasSets = changes.some((change) => change.entity === 'sets');
  const lines = ordered
    .map(lineOf)
    .filter((line): line is ChangeLine => line !== null)
    .filter((line) => !(hasSets && line.entity === 'workouts'));
  return { counts: [...counts].map(([kind, count]) => ({ kind, count })), lines };
}
