import {
  ATHLETE_PROFILE_ID,
  newId,
  SETTING_IDS,
  type ProposalToolOutput,
  type WriteToolOutput,
} from '@liftwise/core';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { call, createDevice, db, pull, push, upsert } from '../../test/helpers';
import {
  confirmProposal,
  done,
  pushDay,
  rejectProposal,
  runNamed,
  THREAD_ID,
  TODAY,
} from '../../test/tools';
import { changeLog, pendingProposals, sets, settings } from '../db/schema';
import { applyWrites } from '../sync/write';

const trainingRow = (target_rir: { min: number; max: number }, rest_seconds = 120) => ({
  id: SETTING_IDS.training,
  key: 'training',
  value: { rest_seconds, target_rir, weight_step_kg: 1.25 },
});

const proposalRow = async (id: string) =>
  (await db().select().from(pendingProposals).where(eq(pendingProposals.id, id)))[0];

const trainingValue = async () =>
  (await db().select().from(settings).where(eq(settings.id, SETTING_IDS.training)))[0]?.value;

const agentGroups = async () => {
  const rows = await db().select().from(changeLog).where(eq(changeLog.actor, 'agent'));
  return rows.filter((row) => row.entity !== 'messages');
};

// A proposal in the state a model turn leaves it, without the stored message.
async function storedProposal(tool: string, input: unknown) {
  const id = newId();
  await db().insert(pendingProposals).values({
    id,
    thread_id: THREAD_ID,
    tool,
    input,
    status: 'pending',
    created_at: new Date().toISOString(),
  });
  return id;
}

let token: string;
beforeEach(async () => {
  ({ token } = await createDevice());
});

describe('resolving a proposal', () => {
  const profileProposal = () =>
    runNamed<ProposalToolOutput>('update_profile', { content: 'Cel: siła' });

  it('needs a device token', async () => {
    const { proposalId } = await profileProposal();
    for (const action of ['confirm', 'reject']) {
      const response = await call(`/api/agent/proposals/${proposalId}/${action}`, {
        method: 'POST',
      });
      expect(response.status).toBe(401);
    }
    expect(await proposalRow(proposalId)).toMatchObject({ status: 'pending' });
  });

  it('answers 404 for an unknown proposal', async () => {
    const id = newId();
    for (const response of [await confirmProposal(token, id), await rejectProposal(token, id)]) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'not_found' });
    }
  });

  it('is done once: a rejected proposal stays rejected and writes nothing', async () => {
    const { proposalId } = await profileProposal();
    expect((await rejectProposal(token, proposalId)).status).toBe(200);
    expect(await proposalRow(proposalId)).toMatchObject({
      status: 'rejected',
      resolved_at: expect.any(String),
    });

    for (const response of [
      await confirmProposal(token, proposalId),
      await rejectProposal(token, proposalId),
    ]) {
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'not_pending', status: 'rejected' });
    }
    expect(await agentGroups()).toEqual([]);
    expect(await runNamed('get_profile', {})).toEqual({ content: '' });
  });

  it('is done once: a confirmed proposal stays confirmed and keeps its write', async () => {
    const { proposalId } = await profileProposal();
    expect((await confirmProposal(token, proposalId)).status).toBe(200);

    const reject = await rejectProposal(token, proposalId);
    expect(reject.status).toBe(409);
    expect(await reject.json()).toEqual({ error: 'not_pending', status: 'confirmed' });
    expect(await runNamed('get_profile', {})).toEqual({ content: 'Cel: siła' });
  });

  it('confirms once when two devices tap together', async () => {
    const { proposalId } = await profileProposal();
    const responses = await Promise.all([
      confirmProposal(token, proposalId),
      confirmProposal(token, proposalId),
    ]);
    expect(responses.map((response) => response.status).toSorted((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    expect(await agentGroups()).toHaveLength(1);
  });

  it('merges into the settings as they are when confirmed, not when proposed (D50)', async () => {
    const proposal = await runNamed<ProposalToolOutput>('update_settings', {
      training: { target_rir_min: 0 },
    });
    await push(token, [upsert('settings', trainingRow({ min: 1, max: 3 }, 75))]);

    expect((await confirmProposal(token, proposal.proposalId)).status).toBe(200);
    expect(await trainingValue()).toMatchObject({
      rest_seconds: 75,
      target_rir: { min: 0, max: 3 },
    });
  });

  it('confirms without a group when the data already is what was proposed', async () => {
    const { proposalId } = await profileProposal();
    await push(token, [
      upsert('athlete_profile', { id: ATHLETE_PROFILE_ID, content: 'Cel: siła' }),
    ]);

    const response = await confirmProposal(token, proposalId);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'confirmed', changes: [] });
    expect(await agentGroups()).toEqual([]);
  });

  it('lets the confirmed group be undone by the user, with what it was before', async () => {
    const {
      sets: [set],
    } = await pushDay(token, TODAY, [done({ weight_kg: 20 }), done()]);
    const proposal = await runNamed<ProposalToolOutput>('update_sets', {
      updates: [{ set_id: set?.id, weight_kg: 22.5 }],
    });
    const body = await (await confirmProposal(token, proposal.proposalId)).json<WriteToolOutput>();

    const undo = await call(`/api/changes/${body.groupId}/undo`, { method: 'POST', token });
    expect(undo.status).toBe(200);
    const [row] = await db()
      .select()
      .from(sets)
      .where(eq(sets.id, set?.id ?? ''));
    expect(row?.weight_kg).toBe(20);
  });
});

describe('a proposal that no longer fits', () => {
  it('fails as stale on an invalid write and stays pending for a later try', async () => {
    await push(token, [upsert('settings', trainingRow({ min: 1, max: 4 }))]);
    const { proposalId } = await runNamed<ProposalToolOutput>('update_settings', {
      training: { target_rir_min: 3 },
    });
    // The minimum proposed is now above the maximum.
    await push(token, [upsert('settings', trainingRow({ min: 1, max: 2 }))]);

    const stale = await confirmProposal(token, proposalId);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: 'stale', reason: 'invalid' });
    expect(await proposalRow(proposalId)).toMatchObject({ status: 'pending', resolved_at: null });
    expect(await trainingValue()).toMatchObject({ target_rir: { min: 1, max: 2 } });

    await push(token, [upsert('settings', trainingRow({ min: 1, max: 4 }))]);
    expect((await confirmProposal(token, proposalId)).status).toBe(200);
    expect(await trainingValue()).toMatchObject({ target_rir: { min: 3, max: 4 } });
  });

  it('fails as stale for the reason of the tool, and can still be rejected', async () => {
    const {
      sets: [set],
    } = await pushDay(token, TODAY, [done()]);
    const { proposalId } = await runNamed<ProposalToolOutput>('update_sets', {
      updates: [{ set_id: set?.id, weight_kg: 22.5 }],
    });
    await push(token, [upsert('sets', { ...set, status: 'planned', performed_at: null })]);

    const stale = await confirmProposal(token, proposalId);
    expect(await stale.json()).toEqual({ error: 'stale', reason: 'not_done' });
    expect(await agentGroups()).toEqual([]);

    expect((await rejectProposal(token, proposalId)).status).toBe(200);
    expect(await proposalRow(proposalId)).toMatchObject({ status: 'rejected' });
  });

  it.each(['nope', 'get_profile', 'propose_workout'])(
    'never runs a stored call of %s, which is no plan to confirm',
    async (tool) => {
      const id = await storedProposal(tool, {});
      const response = await confirmProposal(token, id);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'stale', reason: 'unknown_tool' });
      expect(await proposalRow(id)).toMatchObject({ status: 'pending' });
    },
  );

  it('stays pending when confirming breaks unexpectedly', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const id = await storedProposal('update_profile', { content: 42 });

    const response = await confirmProposal(token, id);

    expect(response.status).toBe(500);
    expect(await proposalRow(id)).toMatchObject({ status: 'pending', resolved_at: null });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('the stored card', () => {
  async function cardMessage(proposal: ProposalToolOutput) {
    const id = newId();
    await applyWrites(db(), { actor: 'agent', threadId: THREAD_ID }, [
      {
        groupId: newId(),
        entity: 'messages',
        op: 'upsert',
        row: {
          id,
          thread_id: THREAD_ID,
          role: 'assistant',
          parts: [{ type: 'tool-x', toolCallId: '1', state: 'output-available', output: proposal }],
        },
      },
    ]);
    return id;
  }

  it('reaches other devices through pull with the outcome', async () => {
    const proposal = await runNamed<ProposalToolOutput>('update_profile', { content: 'Cel' });
    const id = await cardMessage(proposal);
    const { seq } = await pull(token);

    const body = await (
      await confirmProposal(token, proposal.proposalId)
    ).json<ProposalToolOutput>();

    const { changes } = await pull(token, seq);
    const message = changes.find((change) => change.row.id === id);
    expect(message).toMatchObject({
      entity: 'messages',
      row: {
        parts: [{ output: { status: 'confirmed', groupId: body.groupId, changes: body.changes } }],
      },
    });
  });
});
