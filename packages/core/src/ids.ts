import { v7 } from 'uuid';
import { z } from 'zod';

// Entity ids are UUIDv7 generated on the client: offline-safe and time-ordered (§5.1).
export const idSchema = z.uuidv7();

export function newId(): string {
  return v7();
}
