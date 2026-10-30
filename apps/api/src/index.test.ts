import { describe, expect, it } from 'vite-plus/test';
import worker from './index';

describe('api', () => {
  it('answers /health', async () => {
    const response = worker.fetch(new Request('http://localhost/health'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', app: 'LiftWise' });
  });

  it('returns 404 for unknown paths', () => {
    expect(worker.fetch(new Request('http://localhost/nope')).status).toBe(404);
  });
});
