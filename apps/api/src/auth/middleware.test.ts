import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vite-plus/test';
import { call, createDevice, db } from '../../test/helpers';
import { devices } from '../db/schema';

const lastSeen = async (id: string) =>
  (await db().select().from(devices).where(eq(devices.id, id)).get())?.last_seen_at;

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

describe('requireDevice', () => {
  it('rejects requests without a token', async () => {
    const response = await call('/api/devices');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  it('rejects unknown tokens', async () => {
    await createDevice();
    expect((await call('/api/devices', { token: 'nope' })).status).toBe(401);
  });

  it('rejects revoked devices', async () => {
    const { token } = await createDevice('PC', { revoked_at: ago(1000) });
    expect((await call('/api/devices', { token })).status).toBe(401);
  });

  it('accepts an active device and records when it was seen', async () => {
    const { id, token } = await createDevice();
    expect((await call('/api/devices', { token })).status).toBe(200);
    expect(await lastSeen(id)).not.toBeNull();
  });

  it('updates last_seen_at at most once a minute', async () => {
    const recent = ago(30_000);
    const fresh = await createDevice('PC', { last_seen_at: recent });
    await call('/api/devices', { token: fresh.token });
    expect(await lastSeen(fresh.id)).toBe(recent);

    const old = ago(120_000);
    const stale = await createDevice('Phone', { last_seen_at: old });
    await call('/api/devices', { token: stale.token });
    expect(await lastSeen(stale.id)).not.toBe(old);
  });
});
