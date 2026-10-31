import { z } from 'zod';
import { idSchema } from '../ids';
import { weightKgSchema } from './common';

// A new equipment type is a value here plus an item variant below (§5.6).
export const equipmentTypeSchema = z.enum(['dumbbells', 'bench']);
export type EquipmentType = z.infer<typeof equipmentTypeSchema>;

export const equipmentItemSchema = z.discriminatedUnion('type', [
  z.object({
    id: idSchema,
    type: z.literal('dumbbells'),
    props: z.object({ max_kg: weightKgSchema.positive().nullable().default(null) }),
  }),
  z.object({
    id: idSchema,
    type: z.literal('bench'),
    props: z.object({ incline: z.boolean(), decline: z.boolean() }),
  }),
]);
export type EquipmentItem = z.infer<typeof equipmentItemSchema>;
