import type { SyncFields, SyncRow } from '@liftwise/core';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { db } from '../db/database';
import { resetDb } from '../testing';
import { thread, threadList, threadMessages, threadsOn } from './queries';

const STAMP = '2026-10-31T10:00:00.000Z';
const alive: SyncFields = { created_at: STAMP, updated_at: STAMP, deleted_at: null, seq: 1 };
const deleted: SyncFields = { ...alive, deleted_at: STAMP };

// UUIDv7 ids grow with time, so a higher number means written later.
const id = (n: number) => `01a18f41-8c00-7000-8001-${String(n).padStart(12, '0')}`;

const threadRow = (n: number, date: string, sync = alive): SyncRow<'threads'> => ({
  id: id(n),
  date,
  workout_id: null,
  ...sync,
});

const text = (value: string) => ({ type: 'text', text: value });

const messageRow = (
  n: number,
  threadNumber: number,
  role: 'user' | 'assistant',
  parts: SyncRow<'messages'>['parts'],
  sync = alive,
): SyncRow<'messages'> => ({
  id: id(n),
  thread_id: id(threadNumber),
  role,
  parts,
  ...sync,
});

beforeEach(resetDb);

describe('threadsOn', () => {
  it("returns the day's live threads, the first one first, however they were pulled", async () => {
    await db.threads.bulkPut([
      threadRow(2, '2026-11-01'),
      threadRow(1, '2026-11-01'),
      threadRow(3, '2026-11-01', deleted),
      threadRow(4, '2026-11-02'),
    ]);
    const threads = await threadsOn('2026-11-01');
    expect(threads.map((row) => row.id)).toEqual([id(1), id(2)]);
  });
});

describe('thread', () => {
  it('finds a live thread only', async () => {
    await db.threads.bulkPut([threadRow(1, '2026-11-01'), threadRow(2, '2026-11-01', deleted)]);
    expect((await thread(id(1)))?.date).toBe('2026-11-01');
    expect(await thread(id(2))).toBeUndefined();
    expect(await thread(id(3))).toBeUndefined();
  });
});

describe('threadMessages', () => {
  it("returns the thread's live messages in the order they were written", async () => {
    await db.messages.bulkPut([
      messageRow(13, 1, 'assistant', [text('trzecia')]),
      messageRow(11, 1, 'user', [text('pierwsza')]),
      messageRow(12, 1, 'assistant', [text('usunięta')], deleted),
      messageRow(14, 2, 'user', [text('inny wątek')]),
    ]);
    const messages = await threadMessages(id(1));
    expect(messages.map((row) => row.id)).toEqual([id(11), id(13)]);
  });
});

describe('threadList', () => {
  it('lists the newest day first; threads of one day in the order they started', async () => {
    await db.threads.bulkPut([
      threadRow(1, '2026-10-30'),
      threadRow(3, '2026-11-01'),
      threadRow(2, '2026-11-01'),
      threadRow(4, '2026-12-01', deleted),
    ]);
    const list = await threadList();
    expect(list.map((row) => [row.id, row.date])).toEqual([
      [id(2), '2026-11-01'],
      [id(3), '2026-11-01'],
      [id(1), '2026-10-30'],
    ]);
  });

  it('previews the first thing the user wrote in each thread', async () => {
    await db.threads.bulkPut([threadRow(1, '2026-11-01'), threadRow(2, '2026-11-02')]);
    await db.messages.bulkPut([
      messageRow(14, 1, 'user', [text('później')]),
      messageRow(11, 1, 'assistant', [text('Cześć, w czym pomóc?')]),
      messageRow(12, 1, 'user', [text('zaplanuj trening')]),
      messageRow(13, 2, 'user', [text('skróć trening')]),
    ]);
    const list = await threadList();
    expect(list).toEqual([
      { id: id(2), date: '2026-11-02', preview: 'skróć trening' },
      { id: id(1), date: '2026-11-01', preview: 'zaplanuj trening' },
    ]);
  });

  it("skips what isn't text the user still has: a deleted message, parts without text", async () => {
    await db.threads.put(threadRow(1, '2026-11-01'));
    await db.messages.bulkPut([
      messageRow(11, 1, 'user', [text('usunięta')], deleted),
      messageRow(12, 1, 'user', [{ type: 'file', url: 'x' }]),
      messageRow(13, 1, 'user', [{ type: 'step-start' }, text('właściwa')]),
    ]);
    expect((await threadList())[0]?.preview).toBe('właściwa');
  });

  it('has an empty preview when the user wrote nothing', async () => {
    await db.threads.put(threadRow(1, '2026-11-01'));
    await db.messages.put(messageRow(11, 1, 'assistant', [text('Plan na dziś')]));
    expect((await threadList())[0]?.preview).toBe('');
  });
});
