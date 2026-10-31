import { newId } from '@liftwise/core';
import { describe, expect, it } from 'vite-plus/test';
import { draftOf, equipmentFields, EQUIPMENT_TYPES, itemFromDraft } from './fields';

describe('equipment fields', () => {
  it('derives the editor fields of every type from the core schema', () => {
    expect(EQUIPMENT_TYPES).toEqual(['dumbbells', 'bench']);
    expect(equipmentFields('dumbbells')).toEqual([{ key: 'max_kg', kind: 'number' }]);
    expect(equipmentFields('bench')).toEqual([
      { key: 'incline', kind: 'boolean' },
      { key: 'decline', kind: 'boolean' },
    ]);
  });

  it('starts a new item with toggles off and empty numbers', () => {
    expect(draftOf('bench')).toEqual({ incline: false, decline: false });
    expect(draftOf('dumbbells')).toEqual({ max_kg: '' });
  });

  it('shows stored numbers with a decimal comma and reads them back', () => {
    const id = newId();
    const draft = draftOf('dumbbells', { max_kg: 32.5 });
    expect(draft).toEqual({ max_kg: '32,5' });
    expect(itemFromDraft(id, 'dumbbells', draft)).toEqual({
      item: { id, type: 'dumbbells', props: { max_kg: 32.5 } },
    });
  });

  it('reads an empty number as null', () => {
    const id = newId();
    expect(itemFromDraft(id, 'dumbbells', { max_kg: ' ' })).toEqual({
      item: { id, type: 'dumbbells', props: { max_kg: null } },
    });
  });

  it('names the props the schema rejects', () => {
    for (const text of ['abc', '-5', '0', '32,3']) {
      expect(itemFromDraft(newId(), 'dumbbells', { max_kg: text })).toEqual({
        invalid: ['max_kg'],
      });
    }
  });
});
