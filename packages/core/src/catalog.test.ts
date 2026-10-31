import { describe, expect, it } from 'vite-plus/test';
import seed from '../data/exercises.json';
import { seedCatalog } from './catalog';

describe('seed catalog', () => {
  const catalog = seedCatalog();

  it('passes the exercise schema', () => {
    expect(catalog.length).toBeGreaterThanOrEqual(40);
    expect(catalog.length).toBeLessThanOrEqual(60);
  });

  it('has no keys the schema would drop', () => {
    seed.forEach((raw, i) => {
      expect(Object.keys(catalog[i] ?? {})).toEqual(expect.arrayContaining(Object.keys(raw)));
    });
  });

  it('has unique ids', () => {
    expect(new Set(catalog.map((ex) => ex.id)).size).toBe(catalog.length);
  });

  it('has unique names and aliases across the catalog', () => {
    const owners = new Map<string, string>();
    const duplicates: string[] = [];
    for (const ex of catalog) {
      for (const name of [ex.name_pl, ...ex.aliases]) {
        const key = name.toLowerCase();
        const owner = owners.get(key);
        if (owner) duplicates.push(`"${name}": ${owner} / ${ex.name_pl}`);
        owners.set(key, ex.name_pl);
      }
    }
    expect(duplicates).toEqual([]);
  });

  it('includes timed and bodyweight exercises', () => {
    expect(catalog.filter((ex) => ex.measure === 'time').length).toBeGreaterThanOrEqual(3);
    expect(catalog.some((ex) => ex.requires.length === 0)).toBe(true);
  });

  it('ships without user data', () => {
    expect(catalog.every((ex) => ex.note === null && !ex.archived)).toBe(true);
  });
});
