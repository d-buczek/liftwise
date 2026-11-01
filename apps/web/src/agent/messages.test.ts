import { newId, type SyncRow } from '@liftwise/core';
import { describe, expect, it } from 'vite-plus/test';
import { chatView, messageView, type ChatMessage } from './messages';

const threadId = newId();

const stored = (message: ChatMessage, createdAt: string): SyncRow<'messages'> => ({
  ...message,
  role: message.role === 'user' ? 'user' : 'assistant',
  thread_id: threadId,
  created_at: createdAt,
  updated_at: createdAt,
  deleted_at: null,
  seq: 1,
});

const text = (role: string, value: string, id = newId()): ChatMessage => ({
  id,
  role,
  parts: [{ type: 'text', text: value }],
});

describe('messageView', () => {
  it('shows text, running tools, change cards and proposals, but not reads or empty writes', () => {
    const write = {
      groupId: newId(),
      changes: [{ entity: 'sets', id: newId(), op: 'create', before: null, after: {} }],
    };
    const proposal = { proposalId: newId(), status: 'pending', changes: [] };
    const view = messageView(
      {
        id: newId(),
        role: 'assistant',
        parts: [
          { type: 'step-start' },
          {
            type: 'tool-find_exercise',
            toolCallId: 'a',
            state: 'output-available',
            output: { exercises: [] },
          },
          { type: 'tool-log_sets', toolCallId: 'b', state: 'output-available', output: write },
          {
            type: 'tool-update_set',
            toolCallId: 'c',
            state: 'output-available',
            output: { groupId: null, changes: [] },
          },
          {
            type: 'tool-delete_sets',
            toolCallId: 'd',
            state: 'output-available',
            output: proposal,
          },
          { type: 'tool-get_records', toolCallId: 'e', state: 'input-available', input: {} },
          { type: 'tool-log_sets', toolCallId: 'f', state: 'output-error', errorText: 'boom' },
          { type: 'text', text: '  Zapisane.  ' },
        ],
      },
      true,
    );
    expect(view.items).toEqual([
      { kind: 'change', key: 'b', output: write },
      { kind: 'proposal', key: 'd', output: proposal },
      { kind: 'working', key: 'e' },
      { kind: 'text', key: '7', text: 'Zapisane.' },
    ]);
  });
});

describe('chatView', () => {
  it('orders stored messages as the server, then adds the live ones it lacks', () => {
    const first = text('user', 'wyciskanie 24 kg 4x10');
    const answer = text('assistant', 'Zapisane.');
    const next = text('user', 'zmień ostatnią na 22 kg');
    const streaming = text('assistant', 'Zmieniam');
    const view = chatView(
      [stored(answer, '2026-11-01T17:00:05.000Z'), stored(first, '2026-11-01T17:00:00.000Z')],
      [first, answer, next, streaming],
    );
    expect(view.map((message) => [message.id, message.stored])).toEqual([
      [first.id, true],
      [answer.id, true],
      [next.id, false],
      [streaming.id, false],
    ]);
  });

  it('prefers the stored copy, which has the outcome of a confirmation', () => {
    const proposalId = newId();
    const part = (status: string) => ({
      type: 'tool-delete_sets',
      toolCallId: 'x',
      state: 'output-available',
      output: { proposalId, status, changes: [] },
    });
    const id = newId();
    const view = chatView(
      [stored({ id, role: 'assistant', parts: [part('confirmed')] }, '2026-11-01T17:00:00.000Z')],
      [{ id, role: 'assistant', parts: [part('pending')] }],
    );
    expect(view).toHaveLength(1);
    expect(view[0]?.items[0]).toMatchObject({ kind: 'proposal', output: { status: 'confirmed' } });
  });
});
