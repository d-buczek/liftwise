import { v7 } from 'uuid';
import { z } from 'zod';

// Entity ids are UUIDv7 generated on the client: offline-safe and time-ordered (§5.1).
export const idSchema = z.uuidv7();

export function newId(): string {
  return v7();
}

// The agent's model copies whole UUIDs badly: it loses a zero or repeats an id (D55). It sees the
// last characters of an id and the tools take them. With 6-8 hex characters a lost leading zero
// still matches, and a shorter guess matches nothing.
const SHORT_ID = /^[0-9a-f]{6,8}$/i;
const FULL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const shortId = (id: string): string => id.slice(-8);

export const isShortId = (given: string): boolean => SHORT_ID.test(given);

export const isFullId = (given: string): boolean => FULL_ID.test(given);

export const matchesId = (id: string, given: string): boolean =>
  id === given || (isShortId(given) && id.endsWith(given.toLowerCase()));
