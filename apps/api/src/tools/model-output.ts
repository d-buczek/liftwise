import { isFullId, shortId } from '@liftwise/core';

// What the model sees of a tool's output: every id in its short form (D55), the rest unchanged.
// The stored output keeps the full ids, for the cards and for undo. Exercise ids stay as the catalog
// in the system prompt lists them.

const CATALOG_KEYS = new Set(['exercise_id', 'to_exercise_id']);

export function withShortIds(value: unknown, key?: string): unknown {
  if (typeof value === 'string') {
    return isFullId(value) && !(key && CATALOG_KEYS.has(key)) ? shortId(value) : value;
  }
  if (Array.isArray(value)) return value.map((item) => withShortIds(item, key));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, withShortIds(item, name)]),
    );
  }
  return value;
}
