import { describe, expect, it } from 'vite-plus/test';
import { isDoneSet, isWorkingSet } from './conventions';

describe('set conventions', () => {
  it('counts only done sets', () => {
    expect(isDoneSet({ status: 'done' })).toBe(true);
    expect(isDoneSet({ status: 'planned' })).toBe(false);
  });

  it('treats done non-warm-up sets as working sets', () => {
    expect(isWorkingSet({ status: 'done', warmup: false })).toBe(true);
    expect(isWorkingSet({ status: 'done', warmup: true })).toBe(false);
    expect(isWorkingSet({ status: 'planned', warmup: false })).toBe(false);
  });
});
