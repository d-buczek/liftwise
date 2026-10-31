import { describe, expect, it } from 'vite-plus/test';
import { idSchema, newId } from './ids';

describe('ids', () => {
  it('generates UUIDv7', () => {
    expect(idSchema.safeParse(newId()).success).toBe(true);
  });

  it('generates time-ordered ids', () => {
    const ids = Array.from({ length: 100 }, newId);
    expect(ids).toEqual(ids.toSorted());
  });

  it('rejects other UUID versions', () => {
    expect(idSchema.safeParse('3b241101-e2bb-4255-8caf-4136c566a962').success).toBe(false);
  });
});
