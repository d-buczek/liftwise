import { newId, type ProposalStatus, type ProposalToolOutput } from '@liftwise/core';
import { and, eq, isNull } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../app-env';
import type { Db } from '../db';
import { messages, pendingProposals } from '../db/schema';
import { apiError } from '../http';
import { applyWrites, InvalidWrite } from '../sync/write';
import { toolByName } from '../tools';
import { commit, ToolError, type ToolContext } from '../tools/registry';

// Confirmation of risky tool calls (§5.9.3, D50): confirming runs the stored call again on the
// current data and writes it as one change group, without the model; rejecting writes nothing.
// Both record the outcome in the tool result of the stored message, so every device shows it.

export type ProposalResolution = Pick<ProposalToolOutput, 'status' | 'groupId' | 'changes'>;

async function resolve(c: Context<AppEnv>, status: Exclude<ProposalStatus, 'pending'>) {
  const db = c.var.db;
  const id = c.req.param('id') ?? '';
  const [proposal] = await db.select().from(pendingProposals).where(eq(pendingProposals.id, id));
  if (!proposal) return apiError(c, 404, 'not_found');

  // Claimed in one statement, so a proposal is confirmed or rejected once.
  const now = new Date().toISOString();
  const claimed = await db
    .update(pendingProposals)
    .set({ status, resolved_at: now })
    .where(and(eq(pendingProposals.id, id), eq(pendingProposals.status, 'pending')))
    .returning({ id: pendingProposals.id });
  if (claimed.length === 0) return c.json({ error: 'not_pending', status: proposal.status }, 409);

  let resolution: ProposalResolution = { status, changes: [] };
  if (status === 'confirmed') {
    const ctx: ToolContext = { db, threadId: proposal.thread_id, today: now.slice(0, 10), now };
    try {
      const tool = toolByName(proposal.tool);
      if (tool?.risk !== 'risky') throw new ToolError('unknown_tool');
      const result = await commit(ctx, await tool.plan(ctx, tool.input.parse(proposal.input)));
      resolution = { status, changes: result.changes, groupId: result.groupId ?? undefined };
    } catch (error) {
      // The data changed so the call no longer fits: it stays pending, to be rejected.
      await db
        .update(pendingProposals)
        .set({ status: 'pending', resolved_at: null })
        .where(eq(pendingProposals.id, id));
      if (error instanceof ToolError) return c.json({ error: 'stale', reason: error.code }, 409);
      if (error instanceof InvalidWrite) return c.json({ error: 'stale', reason: 'invalid' }, 409);
      throw error;
    }
  }
  await recordResolution(db, proposal.thread_id, id, resolution);
  return c.json(resolution);
}

// The tool result carrying the proposal gets its status (and the written changes).
async function recordResolution(
  db: Db,
  threadId: string,
  proposalId: string,
  resolution: ProposalResolution,
) {
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.thread_id, threadId), isNull(messages.deleted_at)));
  for (const row of rows) {
    let found = false;
    const parts = row.parts.map((part) => {
      const output = (part as { output?: Partial<ProposalToolOutput> }).output;
      if (output?.proposalId !== proposalId) return part;
      found = true;
      return { ...(part as object), output: { ...output, ...resolution } };
    });
    if (!found) continue;
    await applyWrites(db, { actor: 'agent', threadId }, [
      { groupId: newId(), entity: 'messages', op: 'upsert', row: { ...row, parts } },
    ]);
  }
}

export const proposalRoutes = new Hono<AppEnv>()
  .post('/:id/confirm', (c) => resolve(c, 'confirmed'))
  .post('/:id/reject', (c) => resolve(c, 'rejected'));
