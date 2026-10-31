import { and, eq, isNull } from 'drizzle-orm';
import { bearerAuth } from 'hono/bearer-auth';
import type { AppEnv } from '../app-env';
import { devices } from '../db/schema';
import { sha256Hex } from './tokens';

// Writing last_seen_at on every request would double the D1 writes for nothing.
const LAST_SEEN_INTERVAL_MS = 60_000;

const unauthorized = { message: { error: 'unauthorized' } };

// Resolves `Authorization: Bearer <token>` to an active device (§6.8), else 401.
export const requireDevice = bearerAuth<AppEnv>({
  noAuthenticationHeader: unauthorized,
  invalidAuthenticationHeader: unauthorized,
  invalidToken: unauthorized,
  async verifyToken(token, c) {
    const db = c.var.db;
    const device = await db
      .select()
      .from(devices)
      .where(and(eq(devices.token_hash, await sha256Hex(token)), isNull(devices.revoked_at)))
      .get();
    if (!device) return false;

    const now = new Date();
    const lastSeen = device.last_seen_at ? Date.parse(device.last_seen_at) : 0;
    if (now.getTime() - lastSeen >= LAST_SEEN_INTERVAL_MS) {
      device.last_seen_at = now.toISOString();
      await db
        .update(devices)
        .set({ last_seen_at: device.last_seen_at })
        .where(eq(devices.id, device.id));
    }
    c.set('device', device);
    return true;
  },
});
