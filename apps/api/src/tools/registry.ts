import {
  newId,
  type ChangeView,
  type ProposalToolOutput,
  type ToolErrorOutput,
  type WriteToolOutput,
} from '@liftwise/core';
import type { z } from 'zod';
import type { Db } from '../db';
import { pendingProposals } from '../db/schema';
import { domainFields, type Change, type Row } from '../sync/apply';
import { applyWrites, InvalidWrite, prepareWrites, type Write } from '../sync/write';

// The tool registry (§6.6): every tool has a zod input, a risk level and a handler. The same
// registry backs the in-app agent and later the MCP server (§6.11).

export type ToolContext = {
  db: Db;
  threadId: string;
  // The user's local date and time (with offset) when they wrote the message.
  today: string;
  now: string;
};

// A write without its group: each tool call is one change group (§5.9.4).
export type PlannedWrite = Omit<Write, 'groupId'>;

type Handlers<I> =
  | { risk: 'read'; run: (ctx: ToolContext, input: I) => Promise<unknown> }
  // Most write tools return `commit(ctx, writes)`; `undo_change` builds its own result.
  | { risk: 'write'; run: (ctx: ToolContext, input: I) => Promise<WriteToolOutput> }
  // Risky tools never write on the call: their plan is stored and run again on confirmation.
  | { risk: 'risky'; plan: (ctx: ToolContext, input: I) => Promise<PlannedWrite[]> };

export type AgentTool<I = unknown> = {
  name: string;
  description: string;
  input: z.ZodType<I>;
} & Handlers<I>;

export function defineTool<S extends z.ZodType>(
  tool: { name: string; description: string; input: S } & Handlers<z.infer<S>>,
): AgentTool {
  return tool as unknown as AgentTool;
}

// A reason the model can act on (ask, pick another exercise), not a crash.
export class ToolError extends Error {
  constructor(
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = 'ToolError';
  }
}

export function changeView({ entity, before, after }: Change): ChangeView {
  const alive = (row: Row | null) => (row && row.deleted_at === null ? row : null);
  const [was, is] = [alive(before), alive(after)];
  return {
    entity,
    id: after.id,
    op: was === null ? 'create' : is === null ? 'delete' : 'update',
    before: was && { id: was.id, ...domainFields(entity, was) },
    after: is && { id: is.id, ...domainFields(entity, is) },
  };
}

// Writes a tool call's changes as one group by the agent.
export async function commit(ctx: ToolContext, writes: PlannedWrite[]): Promise<WriteToolOutput> {
  const groupId = newId();
  const changes = await applyWrites(
    ctx.db,
    { actor: 'agent', threadId: ctx.threadId },
    writes.map((write) => ({ ...write, groupId })),
  );
  return { groupId: changes.length > 0 ? groupId : null, changes: changes.map(changeView) };
}

// Stores a risky call as a pending proposal and returns its diff for the confirmation card.
async function propose(
  ctx: ToolContext,
  tool: AgentTool,
  input: unknown,
): Promise<ProposalToolOutput> {
  const now = new Date().toISOString();
  const writes = await (tool as Extract<AgentTool, { risk: 'risky' }>).plan(ctx, input);
  const changes = await prepareWrites(
    ctx.db,
    writes.map((write) => ({ ...write, groupId: '' })),
    now,
  );
  if (changes.length === 0) throw new ToolError('nothing_to_change');
  const proposalId = newId();
  await ctx.db.insert(pendingProposals).values({
    id: proposalId,
    thread_id: ctx.threadId,
    tool: tool.name,
    input,
    status: 'pending',
    created_at: now,
  });
  return { proposalId, status: 'pending', changes: changes.map(changeView) };
}

// Runs a validated call by its risk level; reasons a call can't run go back to the model.
export async function runTool(ctx: ToolContext, tool: AgentTool, input: unknown): Promise<unknown> {
  try {
    if (tool.risk === 'risky') return await propose(ctx, tool, input);
    return await tool.run(ctx, input);
  } catch (error) {
    if (error instanceof ToolError) return { error: error.code, ...error.details };
    if (error instanceof InvalidWrite) {
      const { entity, row } = error.write;
      return { error: 'invalid_write', entity, id: row.id } satisfies ToolErrorOutput;
    }
    throw error;
  }
}
