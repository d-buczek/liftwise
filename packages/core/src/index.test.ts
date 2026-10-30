import { describe, expect, it } from 'vite-plus/test';
import { APP_NAME } from './index';

describe('core', () => {
  it('exports the app name', () => {
    expect(APP_NAME).toBe('LiftWise');
  });
});
