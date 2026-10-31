import { describe, expect, it } from 'vite-plus/test';
import { call } from '../test/helpers';

describe('api', () => {
  it('answers /health without auth', async () => {
    const response = await call('/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', app: 'LiftWise' });
  });

  it('returns a JSON 404 for unknown paths', async () => {
    const response = await call('/nope');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });
});

describe('cors', () => {
  const preflight = (origin: string) =>
    call('/api/devices', {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    });

  it('allows the Capacitor origin', async () => {
    const response = await preflight('https://localhost');
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://localhost');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });

  it('sends no CORS headers to other origins', async () => {
    const response = await preflight('https://evil.example');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
