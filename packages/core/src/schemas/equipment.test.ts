import { describe, expect, it } from 'vite-plus/test';
import { newId } from '../ids';
import { equipmentItemSchema } from './equipment';

describe('equipmentItemSchema', () => {
  it('validates props per equipment type', () => {
    const dumbbells = equipmentItemSchema.parse({ id: newId(), type: 'dumbbells', props: {} });
    expect(dumbbells.props).toEqual({ max_kg: null });
    const bench = { id: newId(), type: 'bench', props: { incline: true, decline: false } };
    expect(equipmentItemSchema.safeParse(bench).success).toBe(true);
    expect(equipmentItemSchema.safeParse({ ...bench, props: { max_kg: 30 } }).success).toBe(false);
  });

  it('rejects unknown types', () => {
    const band = { id: newId(), type: 'band', props: {} };
    expect(equipmentItemSchema.safeParse(band).success).toBe(false);
  });
});
