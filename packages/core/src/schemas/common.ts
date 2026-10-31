import { z } from 'zod';
import { RIR_MAX, WEIGHT_PRECISION_KG } from '../conventions';

export const weightKgSchema = z.number().nonnegative().multipleOf(WEIGHT_PRECISION_KG);
export const rirSchema = z.int().min(0).max(RIR_MAX);
export const localDateSchema = z.iso.date();
export const timestampSchema = z.iso.datetime({ offset: true });

export function rangeOf(bound: z.ZodNumber) {
  return z
    .object({ min: bound, max: bound })
    .refine((range) => range.min <= range.max, { message: 'min exceeds max', path: ['max'] });
}

export type Range = { min: number; max: number };
