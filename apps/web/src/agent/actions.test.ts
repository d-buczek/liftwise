import { alertController, toastController } from '@ionic/vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { api as client } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { useSyncStore } from '../stores/sync';
import { mockApi, resetDb } from '../testing';
import { resolveProposal, undoChange, undoneGroups } from './actions';

const GROUP = 'group-1';
const UNDO_PATH = `/api/changes/${GROUP}/undo`;

const present = vi.fn<() => Promise<void>>(async () => undefined);

function stubToast() {
  return vi
    .spyOn(toastController, 'create')
    .mockResolvedValue({ present } as unknown as HTMLIonToastElement);
}

function stubAlert(role: string) {
  return vi.spyOn(alertController, 'create').mockResolvedValue({
    present,
    onDidDismiss: async () => ({ role }),
  } as unknown as HTMLIonAlertElement);
}

function offline() {
  vi.stubGlobal('fetch', async () => Promise.reject(new TypeError('Failed to fetch')));
}

const CONFLICT = { status: 409, body: { error: 'conflict', conflicts: [] } };

let toast: ReturnType<typeof stubToast>;
let sync: ReturnType<typeof vi.fn>;

const toasts = () => toast.mock.calls.map(([options]) => options?.message);

beforeEach(async () => {
  await resetDb();
  setActivePinia(createPinia());
  undoneGroups.clear();
  present.mockClear();
  toast = stubToast();
  useAuthStore().device = { id: 'device', deviceId: 'phone', token: 'token' };
  sync = vi.spyOn(useSyncStore(), 'sync').mockResolvedValue() as unknown as typeof sync;
});
afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('undoChange', () => {
  it("undoes the group with this device's token, marks it, syncs and says so", async () => {
    const api = mockApi(() => ({ status: 200, body: { groupId: 'undo-group' } }));
    await undoChange(GROUP);

    const [path, init] = api.mock.calls[0] ?? [];
    expect(path).toBe(UNDO_PATH);
    expect(JSON.parse(init?.body as string)).toEqual({ confirm: false });
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token');
    expect(undoneGroups.has(GROUP)).toBe(true);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(toasts()).toEqual(['Cofnięto zmianę.']);
  });

  it('treats a group already undone elsewhere as done', async () => {
    mockApi(() => ({ status: 409, body: { error: 'already_undone', groupId: 'undo-group' } }));
    await undoChange(GROUP);

    expect(undoneGroups.has(GROUP)).toBe(true);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(toasts()).toEqual(['Cofnięto zmianę.']);
  });

  it('does nothing without a token', async () => {
    const api = mockApi(() => ({ status: 200, body: { groupId: 'undo-group' } }));
    useAuthStore().device = null;
    await undoChange(GROUP);

    expect(api).not.toHaveBeenCalled();
    expect(undoneGroups.has(GROUP)).toBe(false);
    expect(toasts()).toEqual([]);
  });

  describe('when a record changed after the group', () => {
    it.each(['cancel', 'backdrop'])('keeps everything when dismissed by %s', async (role) => {
      const alert = stubAlert(role);
      const api = mockApi(() => CONFLICT);
      await undoChange(GROUP);

      expect(alert.mock.calls[0]?.[0].header).toBe('Te dane zmieniły się później');
      expect(api).toHaveBeenCalledTimes(1);
      expect(undoneGroups.has(GROUP)).toBe(false);
      expect(sync).not.toHaveBeenCalled();
      expect(toasts()).toEqual([]);
    });

    it('undoes only after confirmation, asking the server to overwrite', async () => {
      stubAlert('confirm');
      const api = mockApi(({ body }) =>
        (body as { confirm: boolean }).confirm
          ? { status: 200, body: { groupId: 'undo-group' } }
          : CONFLICT,
      );
      await undoChange(GROUP);

      const confirms = api.mock.calls.map(
        ([, init]) => JSON.parse(init?.body as string) as unknown,
      );
      expect(confirms).toEqual([{ confirm: false }, { confirm: true }]);
      expect(undoneGroups.has(GROUP)).toBe(true);
      expect(sync).toHaveBeenCalledTimes(1);
      expect(toasts()).toEqual(['Cofnięto zmianę.']);
    });

    it('reports a confirmed undo that fails and leaves the group not undone', async () => {
      stubAlert('confirm');
      mockApi(({ body }) =>
        (body as { confirm: boolean }).confirm
          ? { status: 500, body: { error: 'internal' } }
          : CONFLICT,
      );
      await undoChange(GROUP);

      expect(undoneGroups.has(GROUP)).toBe(false);
      expect(sync).not.toHaveBeenCalled();
      expect(toasts()).toEqual(['Nieoczekiwany błąd serwera. Spróbuj ponownie.']);
    });
  });

  describe('when it fails', () => {
    it.each([
      [401, 'unauthorized', 'Token jest nieprawidłowy albo to urządzenie zostało odwołane.'],
      [404, 'not_found', 'Serwer nie ma już tego wpisu. Odśwież dane synchronizacją.'],
      [500, 'internal', 'Nieoczekiwany błąd serwera. Spróbuj ponownie.'],
    ])('%i %s: says what happened and leaves the card', async (status, error, message) => {
      mockApi(() => ({ status, body: { error } }));
      await undoChange(GROUP);

      expect(toasts()).toEqual([message]);
      expect(undoneGroups.has(GROUP)).toBe(false);
      expect(sync).not.toHaveBeenCalled();
    });

    it('offline: says there is no connection, so the user can try again', async () => {
      offline();
      await undoChange(GROUP);

      expect(toasts()).toEqual([
        'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.',
      ]);
      expect(undoneGroups.has(GROUP)).toBe(false);
    });

    it('a bug in the client is logged and reads as an unexpected error', async () => {
      const failure = new RangeError('bug');
      vi.spyOn(client, 'undo').mockRejectedValue(failure);
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await undoChange(GROUP);

      expect(log).toHaveBeenCalledWith(failure);
      expect(toasts()).toEqual(['Nieoczekiwany błąd serwera. Spróbuj ponownie.']);
    });
  });
});

describe('resolveProposal', () => {
  it.each(['confirm', 'reject'] as const)('%s: tells the server, then syncs', async (action) => {
    const api = mockApi(() => ({ status: 200, body: { status: 'confirmed', changes: [] } }));
    await resolveProposal('p1', action);

    expect(api.mock.calls[0]?.[0]).toBe(`/api/agent/proposals/p1/${action}`);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(toasts()).toEqual([]);
  });

  it('already resolved on another device: quietly syncs to show how', async () => {
    mockApi(() => ({ status: 409, body: { error: 'not_pending', status: 'confirmed' } }));
    await resolveProposal('p1', 'confirm');

    expect(sync).toHaveBeenCalledTimes(1);
    expect(toasts()).toEqual([]);
  });

  it('stale: asks for a new proposal', async () => {
    mockApi(() => ({ status: 409, body: { error: 'stale', reason: 'invalid' } }));
    await resolveProposal('p1', 'confirm');

    expect(toasts()).toEqual(['Dane zmieniły się od tej propozycji. Poproś agenta o nową.']);
    expect(sync).not.toHaveBeenCalled();
  });

  it('an expired token or no connection is reported and nothing syncs', async () => {
    mockApi(() => ({ status: 401, body: { error: 'unauthorized' } }));
    await resolveProposal('p1', 'confirm');
    offline();
    await resolveProposal('p1', 'confirm');

    expect(toasts()).toEqual([
      'Token jest nieprawidłowy albo to urządzenie zostało odwołane.',
      'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.',
    ]);
    expect(sync).not.toHaveBeenCalled();
  });

  it('does nothing without a token', async () => {
    const api = mockApi(() => ({ status: 200, body: {} }));
    useAuthStore().device = null;
    await resolveProposal('p1', 'confirm');

    expect(api).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
  });
});

describe('where the toast sits', () => {
  it('above the message field of the shown page, not of one Ionic keeps hidden', async () => {
    document.body.innerHTML = `
      <div class="ion-page ion-page-hidden"><ion-footer class="lw-composer" id="behind"></ion-footer></div>
      <div class="ion-page"><ion-footer class="lw-composer" id="visible"></ion-footer></div>`;
    offline();
    await resolveProposal('p1', 'confirm');
    expect(toast.mock.calls[0]?.[0]?.positionAnchor).toBe(document.getElementById('visible'));
  });

  it('at the plain bottom on an earlier thread, which has no message field', async () => {
    document.body.innerHTML = `
      <div class="ion-page ion-page-hidden"><ion-footer class="lw-composer"></ion-footer></div>
      <div class="ion-page"></div>`;
    offline();
    await resolveProposal('p1', 'confirm');
    expect(toast.mock.calls[0]?.[0]?.positionAnchor).toBeUndefined();
  });
});
