import {
  equipmentItemSchema,
  equipmentTypeSchema,
  type EquipmentItem,
  type EquipmentType,
} from '@liftwise/core';
import type { z } from 'zod';

// The generic item editor (§5.6) reads each type's props from the core schema, so a new type
// needs its schema variant and labels in the locale file, but no UI code.
export type EquipmentField = { key: string; kind: 'boolean' } | { key: string; kind: 'number' };

export const EQUIPMENT_TYPES: EquipmentType[] = equipmentTypeSchema.options;

function propsShape(type: EquipmentType): Record<string, z.ZodType> {
  const variant = equipmentItemSchema.options.find((option) => option.shape.type.value === type);
  if (!variant) throw new Error(`no equipment schema for ${type}`);
  return variant.shape.props.shape;
}

function fieldOf(key: string, schema: z.ZodType): EquipmentField {
  const def = schema.def as { type: string; innerType?: z.ZodType };
  if (def.innerType) return fieldOf(key, def.innerType);
  if (def.type === 'boolean') return { key, kind: 'boolean' };
  if (def.type === 'number') return { key, kind: 'number' };
  throw new Error(`equipment prop ${key} has an unsupported type: ${def.type}`);
}

export function equipmentFields(type: EquipmentType): EquipmentField[] {
  return Object.entries(propsShape(type)).map(([key, schema]) => fieldOf(key, schema));
}

// Editor values: a toggle per boolean, a text per number (Polish decimal comma allowed).
export type EquipmentDraft = Record<string, boolean | string>;

export function draftOf(type: EquipmentType, props?: Record<string, unknown>): EquipmentDraft {
  return Object.fromEntries(
    equipmentFields(type).map((field) => {
      const value = props?.[field.key];
      if (field.kind === 'boolean') return [field.key, value === true];
      return [field.key, typeof value === 'number' ? String(value).replace('.', ',') : ''];
    }),
  );
}

// An empty number is null (e.g. no dumbbell limit) and text that isn't a number fails the
// schema; returns the item or the keys of the invalid props.
export function itemFromDraft(
  id: string,
  type: EquipmentType,
  draft: EquipmentDraft,
): { item: EquipmentItem } | { invalid: string[] } {
  const props = Object.fromEntries(
    equipmentFields(type).map((field) => {
      const value = draft[field.key];
      if (field.kind === 'boolean') return [field.key, value === true];
      const text = typeof value === 'string' ? value.trim() : '';
      return [field.key, text === '' ? null : Number(text.replace(',', '.'))];
    }),
  );
  const parsed = equipmentItemSchema.safeParse({ id, type, props });
  if (parsed.success) return { item: parsed.data };
  const keys = parsed.error.issues.flatMap((issue) =>
    issue.path[0] === 'props' && typeof issue.path[1] === 'string' ? [issue.path[1]] : [],
  );
  return { invalid: [...new Set(keys)] };
}
