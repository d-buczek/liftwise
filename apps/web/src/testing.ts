// Fixtures for web tests.
import { newId, type SyncRow } from '@liftwise/core';
import { vi } from 'vite-plus/test';
import { db } from './db/database';

export async function resetDb() {
  await db.delete();
  await db.open();
}

export function dumbbells(maxKg: number | null = 32.5) {
  return { id: newId(), type: 'dumbbells' as const, props: { max_kg: maxKg } };
}

// An equipment row as the server returns it in a pull.
export function pulledBench(seq: number, id = newId()): SyncRow<'equipment_items'> {
  return {
    id,
    type: 'bench',
    props: { incline: true, decline: false },
    created_at: '2026-10-31T10:00:00.000Z',
    updated_at: '2026-10-31T10:00:00.000Z',
    deleted_at: null,
    seq,
  };
}

type Handler = (request: { method: string; path: string; body: unknown }) => {
  status: number;
  body?: unknown;
};

// Replaces fetch with a handler; returns the mock to inspect the calls.
export function mockApi(handler: Handler) {
  const mock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(
    async (input, init = {}) => {
      const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      const { status, body: responseBody } = handler({
        method: init.method ?? 'GET',
        path: input,
        body,
      });
      return new Response(responseBody === undefined ? null : JSON.stringify(responseBody), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}
