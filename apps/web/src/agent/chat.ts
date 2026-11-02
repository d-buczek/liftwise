import { useChat } from '@ai-sdk/vue';
import { newId } from '@liftwise/core';
import { DefaultChatTransport } from 'ai';
import type { Ref } from 'vue';
import { apiUrl, fetchWithTimeout, UNREACHABLE } from '../api/client';
import type { ChatMessage } from './messages';

// The agent turn on the client (§6.5, §6.6): the AI SDK chat streams the answer; the server
// keeps the thread, so a request carries only the new message.

const pad = (value: number) => String(value).padStart(2, '0');

// The device's local time with its offset (`2026-11-01T18:05:00+01:00`): the day and time the
// agent logs sets with.
export function localTimestamp(now = new Date()): string {
  const offset = -now.getTimezoneOffset();
  const local = new Date(now.getTime() + offset * 60_000).toISOString().slice(0, 19);
  const sign = offset < 0 ? '-' : '+';
  const minutes = Math.abs(offset);
  return `${local}${sign}${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

// The body of `POST /api/agent/chat`: the last user message with its text parts only, and when it
// was said (now, or earlier for a queued prompt).
export function chatRequest(
  threadId: string,
  messages: ChatMessage[],
  localTime = localTimestamp(),
) {
  const message = messages.findLast((candidate) => candidate.role === 'user');
  if (!message) throw new Error('the chat has no user message to send');
  const parts = message.parts.flatMap((part) =>
    part.type === 'text' && typeof part.text === 'string'
      ? [{ type: 'text', text: part.text }]
      : [],
  );
  return {
    threadId,
    message: { id: message.id, role: 'user', parts },
    localTime,
  };
}

// The transport of a turn; `localTime` is fixed for a queued prompt.
export function chatTransport(token: () => string | null, localTime?: string) {
  return new DefaultChatTransport({
    api: apiUrl('/api/agent/chat'),
    fetch: fetchWithTimeout,
    headers: (): Record<string, string> => ({ Authorization: `Bearer ${token() ?? ''}` }),
    prepareSendMessagesRequest: ({ id, messages }) => ({
      body: chatRequest(id, messages, localTime),
    }),
  });
}

export type ChatFailure = { code: string; provider?: string };

// A failed turn as an error code: the API's (`provider_unavailable` with the provider),
// `unreachable` when the request never got through, or `model_error` from the stream.
export function chatFailure(error: Error): ChatFailure {
  if ('responseBody' in error && typeof error.responseBody === 'string') {
    try {
      const body: unknown = JSON.parse(error.responseBody);
      if (typeof body === 'object' && body !== null && 'error' in body) {
        const { error: code, provider } = body as { error: unknown; provider?: unknown };
        if (typeof code === 'string') {
          return typeof provider === 'string' ? { code, provider } : { code };
        }
      }
    } catch {
      // Not JSON: an error page of a proxy.
    }
    return { code: 'unknown' };
  }
  if (error instanceof TypeError) return { code: UNREACHABLE };
  return { code: error.message === 'model_error' ? 'model_error' : 'unknown' };
}

// The chat of a thread; a new thread (the next day) starts a new chat.
export function useAgentChat(threadId: Ref<string>, token: () => string | null) {
  return useChat(() => ({
    id: threadId.value,
    generateId: newId,
    transport: chatTransport(token),
  }));
}
