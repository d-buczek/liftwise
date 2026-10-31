import { z } from 'zod';
import seed from '../data/exercises.json';
import { exerciseSchema, type Exercise } from './schemas/exercise';

export const exerciseCatalogSchema = z.array(exerciseSchema);

// Seed catalog (D22) with fixed UUIDv7 ids, so the server and every device share them.
export function seedCatalog(): Exercise[] {
  return exerciseCatalogSchema.parse(seed);
}
