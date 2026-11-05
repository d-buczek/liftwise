import { describe, expect, it } from 'vite-plus/test';
import { idSchema, isFullId, isShortId, matchesId, newId, shortId } from './ids';

describe('short ids for the model', () => {
  const ID = '01a18d97-e1d7-701f-ad35-058b1ee45aed';

  it('are the last characters of an id', () => {
    expect(shortId(ID)).toBe('1ee45aed');
    expect(isShortId(shortId(ID))).toBe(true);
    expect(isFullId(ID)).toBe(true);
    expect(isFullId(shortId(ID))).toBe(false);
  });

  it('match their id, in any case and with a lost leading character', () => {
    expect(matchesId(ID, ID)).toBe(true);
    expect(matchesId(ID, '1ee45aed')).toBe(true);
    expect(matchesId(ID, '1EE45AED')).toBe(true);
    expect(matchesId(ID, 'ee45aed')).toBe(true);
    expect(matchesId(ID, 'e45aed')).toBe(true);
  });

  it('match nothing when too short, not hex or ending otherwise', () => {
    for (const given of ['45aed', '', '1ee45aex', '%%%%%%', '2ee45aed', '01ee45aed']) {
      expect(matchesId(ID, given)).toBe(false);
    }
    expect(isShortId('%%%%%%')).toBe(false);
  });
});

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
