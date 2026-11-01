import type { SyncRow } from '@liftwise/core';
import { db } from '../db/database';
import { alive } from '../workout/queries';

// Reads of the agent's threads and messages in the mirror (§5.9.5), for `useLiveQuery`.

const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

// A day's threads, the first one first; normally there is one.
export async function threadsOn(date: string): Promise<SyncRow<'threads'>[]> {
  return (await db.threads.where('date').equals(date).toArray()).filter(alive).sort(byId);
}

export async function thread(id: string): Promise<SyncRow<'threads'> | undefined> {
  const row = await db.threads.get(id);
  return alive(row) ? row : undefined;
}

export async function threadMessages(threadId: string): Promise<SyncRow<'messages'>[]> {
  return (await db.messages.where('thread_id').equals(threadId).toArray()).filter(alive);
}

export type ThreadEntry = { id: string; date: string; preview: string };

// Every thread, the newest day first, with the first thing the user wrote.
export async function threadList(): Promise<ThreadEntry[]> {
  const threads = (await db.threads.toArray()).filter(alive);
  const firstTexts = new Map<string, string>();
  const messages = (await db.messages.toArray()).filter(alive).sort(byId);
  for (const message of messages) {
    if (message.role !== 'user' || firstTexts.has(message.thread_id)) continue;
    const text = message.parts.find((part) => part.type === 'text')?.text;
    if (typeof text === 'string') firstTexts.set(message.thread_id, text);
  }
  return threads
    .sort((a, b) => b.date.localeCompare(a.date) || byId(a, b))
    .map((row) => ({ id: row.id, date: row.date, preview: firstTexts.get(row.id) ?? '' }));
}
