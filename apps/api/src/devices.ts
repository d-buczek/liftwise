import { and, asc, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppEnv } from './app-env';
import { devices, pairingCodes } from './db/schema';
import { apiError } from './http';

export const deviceRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const rows = await c.var.db
      .select()
      .from(devices)
      .where(isNull(devices.revoked_at))
      .orderBy(asc(devices.created_at));
    return c.json({
      devices: rows.map((device) => ({
        id: device.id,
        name: device.name,
        createdAt: device.created_at,
        lastSeenAt: device.last_seen_at,
        current: device.id === c.var.device.id,
      })),
    });
  })
  // Revoking the current device is allowed: its token stops working right away.
  .delete('/:id', async (c) => {
    const db = c.var.db;
    const id = c.req.param('id');
    // Unused codes go with the device, or a stolen one could still pair a new device.
    const [revoked] = await db.batch([
      db
        .update(devices)
        .set({ revoked_at: new Date().toISOString() })
        .where(and(eq(devices.id, id), isNull(devices.revoked_at)))
        .returning({ id: devices.id }),
      db
        .delete(pairingCodes)
        .where(and(eq(pairingCodes.created_by, id), isNull(pairingCodes.used_at))),
    ]);
    return revoked.length > 0 ? c.body(null, 204) : apiError(c, 404, 'not_found');
  });
