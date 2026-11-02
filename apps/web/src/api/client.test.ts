import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { fetchWithTimeout } from './client';

// A server that keeps the request open until it is aborted.
function silentServer() {
  const mock = vi.fn<(input: string, init: RequestInit) => Promise<Response>>(
    (_input, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      }),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fails like a lost network when the server does not respond', async () => {
    silentServer();
    const result = fetchWithTimeout('/api/x').catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toBeInstanceOf(TypeError);
  });

  it('keeps an abort by the caller as an abort', async () => {
    silentServer();
    const stop = new AbortController();
    const result = fetchWithTimeout('/api/x', { signal: stop.signal }).catch(
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(1_000);
    stop.abort();
    expect(await result).toMatchObject({ name: 'AbortError' });
  });

  it("doesn't limit reading a response that has started", async () => {
    const mock = vi.fn<(input: string, init: RequestInit) => Promise<Response>>(
      async () => new Response('ok'),
    );
    vi.stubGlobal('fetch', mock);
    await fetchWithTimeout('/api/x');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mock.mock.calls[0]?.[1].signal?.aborted).toBe(false);
  });
});
