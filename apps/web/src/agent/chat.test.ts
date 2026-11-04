import { newId, timestampSchema } from '@liftwise/core';
import { describe, expect, it } from 'vite-plus/test';
import { today } from '../workout/calendar';
import { chatFailure, chatRequest, localTimestamp } from './chat';

describe('localTimestamp', () => {
  it('is the local date and time with the offset, the same instant to the second', () => {
    const now = new Date('2026-11-01T23:30:15.678Z');
    const value = localTimestamp(now);
    expect(timestampSchema.safeParse(value).success).toBe(true);
    expect(value.slice(0, 10)).toBe(today(now));
    expect(new Date(value).getTime()).toBe(Math.floor(now.getTime() / 1000) * 1000);
  });
});

describe('chatRequest', () => {
  it('sends only the last user message, text parts only', () => {
    const threadId = newId();
    const earlier = { id: newId(), role: 'user', parts: [{ type: 'text', text: 'hej' }] };
    const answer = { id: newId(), role: 'assistant', parts: [{ type: 'text', text: 'Cześć' }] };
    const last = {
      id: newId(),
      role: 'user',
      parts: [{ type: 'text', text: 'wyciskanie 24 kg 4x10', state: 'done' }, { type: 'file' }],
    };
    const localTime = '2026-11-01T18:00:00+01:00';
    expect(chatRequest(threadId, [earlier, answer, last], localTime)).toEqual({
      threadId,
      message: {
        id: last.id,
        role: 'user',
        parts: [{ type: 'text', text: 'wyciskanie 24 kg 4x10' }],
      },
      localTime,
    });
  });

  it('says what to plan for a check-in', () => {
    const message = { id: newId(), role: 'user', parts: [{ type: 'text', text: 'Plan' }] };
    const workout = { date: '2026-11-05', time_min: 45 };
    expect(chatRequest(newId(), [message], undefined, workout).workout).toEqual(workout);
  });

  it('is sent with the current local time by default', () => {
    const message = { id: newId(), role: 'user', parts: [{ type: 'text', text: 'hej' }] };
    const { localTime } = chatRequest(newId(), [message]);
    expect(timestampSchema.safeParse(localTime).success).toBe(true);
    expect(Math.abs(new Date(localTime).getTime() - Date.now())).toBeLessThan(5_000);
  });
});

describe('chatFailure', () => {
  const apiError = (status: number, body: string) =>
    Object.assign(new Error(body), { statusCode: status, responseBody: body });

  it('reads the API error code and the provider', () => {
    expect(
      chatFailure(
        apiError(409, JSON.stringify({ error: 'provider_unavailable', provider: 'openai' })),
      ),
    ).toEqual({ code: 'provider_unavailable', provider: 'openai' });
    expect(chatFailure(apiError(401, JSON.stringify({ error: 'unauthorized' })))).toEqual({
      code: 'unauthorized',
    });
    expect(chatFailure(apiError(502, '<html>Bad gateway</html>'))).toEqual({ code: 'unknown' });
  });

  it('tells a failed request from an error of the model', () => {
    expect(chatFailure(new TypeError('Failed to fetch'))).toEqual({ code: 'unreachable' });
    expect(chatFailure(new Error('model_error'))).toEqual({ code: 'model_error' });
  });
});
