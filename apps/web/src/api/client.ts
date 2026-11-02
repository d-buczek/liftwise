import type {
  ProposalToolOutput,
  ProvidersResponse,
  SyncMutation,
  SyncPullResponse,
  SyncPushResponse,
} from '@liftwise/core';

// Empty for the PWA, which the Worker serves from the API's origin (§6.1).
const BASE_URL = import.meta.env.VITE_API_URL ?? '';

// Where the PWA lives: the Android app's own origin is https://localhost (pairing QR code).
export function appOrigin(): string {
  return BASE_URL ? new URL(BASE_URL).origin : window.location.origin;
}

// An endpoint's URL, for clients that fetch on their own (the agent chat stream).
export function apiUrl(path: string): string {
  return `${BASE_URL}${path}`;
}

// `fetch` itself failed: no network, or the server can't be reached.
export const UNREACHABLE = 'unreachable';

// How long a request waits for the server's response to start.
const RESPONSE_TIMEOUT_MS = 20_000;

// `fetch` that fails like a lost network when the server doesn't answer: a weak signal or a dead
// address can hold a request open for minutes. Only the wait for the response is limited, since an
// agent's answer streams for as long as it takes.
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), RESPONSE_TIMEOUT_MS);
  try {
    return await fetch(input, {
      ...init,
      signal: init.signal ? AbortSignal.any([init.signal, timeout.signal]) : timeout.signal,
    });
  } catch (error) {
    if (timeout.signal.aborted) throw new TypeError('the server did not respond');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// The server's `{ error: '<code>' }` with the HTTP status; status 0 for UNREACHABLE.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  { method = 'GET', token, body }: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (body !== undefined) headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetchWithTimeout(apiUrl(path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, UNREACHABLE);
  }

  const json: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const code =
      typeof json === 'object' && json !== null && 'error' in json && typeof json.error === 'string'
        ? json.error
        : 'http_error';
    throw new ApiError(response.status, code);
  }
  return json as T;
}

export type DeviceInfo = {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
  current: boolean;
};

// Endpoints of §6.5 used by the app shell.
export const api = {
  redeemPairingCode: (code: string, name: string) =>
    request<{ deviceId: string; token: string }>('/api/auth/pairing/redeem', {
      method: 'POST',
      body: { code, name },
    }),
  createPairingCode: (token: string) =>
    request<{ code: string; expiresAt: string }>('/api/auth/pairing', { method: 'POST', token }),
  listDevices: (token: string) => request<{ devices: DeviceInfo[] }>('/api/devices', { token }),
  revokeDevice: (token: string, id: string) =>
    request<null>(`/api/devices/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  push: (token: string, mutations: SyncMutation[]) =>
    request<SyncPushResponse>('/api/sync/push', { method: 'POST', token, body: { mutations } }),
  pull: (token: string, since: number) =>
    request<SyncPullResponse>(`/api/sync/pull?since=${since}`, { token }),
  providers: (token: string) => request<ProvidersResponse>('/api/providers', { token }),
  // `confirm` reverts records changed after the group too (409 `conflict` without it).
  undo: (token: string, groupId: string, confirm = false) =>
    request<{ groupId: string | null }>(`/api/changes/${encodeURIComponent(groupId)}/undo`, {
      method: 'POST',
      token,
      body: { confirm },
    }),
  resolveProposal: (token: string, id: string, action: 'confirm' | 'reject') =>
    request<Pick<ProposalToolOutput, 'status' | 'groupId' | 'changes'>>(
      `/api/agent/proposals/${encodeURIComponent(id)}/${action}`,
      { method: 'POST', token },
    ),
};
