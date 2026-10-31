import { newId } from '@liftwise/core';
import { and, count, eq, gt, isNull, lte } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app-env';
import { devices, pairingCodes, pairingFailures } from '../db/schema';
import { apiError, readJson } from '../http';
import { generatePairingCode, generateToken, normalizePairingCode, sha256Hex } from './tokens';

const CODE_TTL_MS = 5 * 60_000;

// Single user: one global limit is enough and keeps the behavior deterministic (§6.8).
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 10 * 60_000;

const redeemSchema = z.object({
  // Room for spaces and dashes; caps the input that gets hashed.
  code: z.string().max(32),
  name: z.string().trim().min(1).max(64),
});

export const pairingRoutes = new Hono<AppEnv>()
  // An authorized device asks for a code to show as QR and text.
  .post('/', async (c) => {
    const db = c.var.db;
    const code = generatePairingCode();
    const now = Date.now();
    const expiresAt = new Date(now + CODE_TTL_MS).toISOString();
    // A new code replaces any code that hasn't been used.
    await db.batch([
      db.delete(pairingCodes).where(isNull(pairingCodes.used_at)),
      db.insert(pairingCodes).values({
        id: newId(),
        code_hash: await sha256Hex(code),
        created_by: c.var.device.id,
        created_at: new Date(now).toISOString(),
        expires_at: expiresAt,
      }),
    ]);
    return c.json({ code, expiresAt }, 201);
  })
  // A new device exchanges the code for its token; runs without auth.
  .post('/redeem', async (c) => {
    const db = c.var.db;
    const body = await readJson(c, redeemSchema);
    if (!body) return apiError(c, 400, 'invalid_request');

    const now = new Date().toISOString();
    const windowStart = new Date(Date.now() - FAILURE_WINDOW_MS).toISOString();

    // An attempt counts as a failure until its code checks out. Recording it and counting
    // in one batch (a transaction) keeps parallel requests from slipping past the limit.
    const attemptId = newId();
    const [, , counted] = await db.batch([
      db.delete(pairingFailures).where(lte(pairingFailures.at, windowStart)),
      db.insert(pairingFailures).values({ id: attemptId, at: now }),
      db.select({ failures: count() }).from(pairingFailures),
    ]);
    const forgetAttempt = db.delete(pairingFailures).where(eq(pairingFailures.id, attemptId));
    if ((counted[0]?.failures ?? 0) > MAX_FAILURES) {
      // A blocked attempt doesn't extend the block.
      await forgetAttempt;
      return apiError(c, 429, 'too_many_attempts');
    }

    // One statement, so concurrent requests can't redeem the same code twice.
    const redeemed = await db
      .update(pairingCodes)
      .set({ used_at: now })
      .where(
        and(
          eq(pairingCodes.code_hash, await sha256Hex(normalizePairingCode(body.code))),
          isNull(pairingCodes.used_at),
          gt(pairingCodes.expires_at, now),
        ),
      )
      .returning({ id: pairingCodes.id })
      .get();

    // Wrong, expired and used codes look the same to the caller.
    if (!redeemed) return apiError(c, 400, 'invalid_code');

    const token = generateToken();
    const deviceId = newId();
    await db.batch([
      forgetAttempt,
      db.insert(devices).values({
        id: deviceId,
        name: body.name,
        token_hash: await sha256Hex(token),
        created_at: now,
      }),
    ]);
    c.header('Cache-Control', 'no-store');
    return c.json({ deviceId, token }, 201);
  });
