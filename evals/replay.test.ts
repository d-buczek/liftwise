import { newId } from '@liftwise/core';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it, vi } from 'vite-plus/test';
import { ProviderUnavailable } from '../apps/api/src/agent/providers';
import { CASES, type EvalCase } from './cases';
import { EX } from './fixtures';
import { metered, runCase, startResult, type Resolve } from './harness';
import type { EvalMeta } from './report';
import {
  concrete,
  inputOf,
  Matcher,
  type ExpectedCall,
  type Turn,
  type TurnExpectation,
} from './score';

// Every case on a model that answers with exactly what the case expects: the expected calls fit
// the tool schemas, the handlers accept them on the fixtures and the scoring passes them. A tool
// change that breaks a case fails here, in `ci:check`, instead of in a run that costs tokens.

type StreamPart =
  Awaited<ReturnType<MockLanguageModelV4['doStream']>>['stream'] extends ReadableStream<infer P>
    ? P
    : never;

const usage = {
  inputTokens: { total: 10, noCache: 8, cacheRead: 2, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

const step = (finish: 'stop' | 'tool-calls', ...parts: StreamPart[]) => ({
  stream: convertArrayToReadableStream<StreamPart>([
    { type: 'stream-start', warnings: [] },
    ...parts,
    { type: 'finish', finishReason: { unified: finish, raw: finish }, usage },
  ]),
});

const answer = (delta: string) =>
  step(
    'stop',
    { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', delta },
    { type: 'text-end', id: 't' },
  );

const toolStep = (call: ExpectedCall, previous: Turn[]) =>
  step('tool-calls', {
    type: 'tool-call',
    toolCallId: newId(),
    toolName: call.tool,
    input: JSON.stringify(concrete(inputOf(call, previous))),
  });

function replyOf(expected: TurnExpectation): string {
  if (expected.question) return 'Które dokładnie?';
  return expected.reply instanceof Matcher ? String(expected.reply.example) : 'Zapisane.';
}

// A plan the checks accept, for the `planner` calls of `propose_workout`.
const PLAN = JSON.stringify({
  exercises: [
    {
      exercise_id: EX.bench,
      sets: [{ weight_kg: 24, reps: 10, duration_s: null, warmup: false }],
      target_rir: 1,
    },
  ],
  rationale: 'Plan na dziś.',
});

const replayResolver = (
  expected: TurnExpectation,
  previous: Turn[],
  meter: Parameters<typeof metered>[1],
): Resolve => {
  const reads = (expected.reads ?? []).map((read) => (Array.isArray(read) ? read[0]! : read));
  const model = metered(
    new MockLanguageModelV4({
      doStream: [
        ...[...reads, ...(expected.calls ?? [])].map((call) => toolStep(call, previous)),
        answer(replyOf(expected)),
      ],
      doGenerate: async () => ({
        content: [{ type: 'text', text: PLAN }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
      }),
    }),
    meter,
  );
  return () => ({ provider: 'anthropic', model });
};

// A valid setting; the resolver below never looks at it.
const models = { provider: 'anthropic', fast: 'replay', planner: 'replay' };

describe('every eval case, replayed', () => {
  it.for(CASES)('$id', async (evalCase, { task }) => {
    const result = startResult(evalCase, models);
    (task.meta as EvalMeta).evalResult = result;
    await runCase(evalCase, result, replayResolver);
    expect(result.turns.flatMap((turn) => turn.problems)).toEqual([]);
    expect(result.turns).toHaveLength(evalCase.turns.length);
    expect(result.turns.every((turn) => turn.usage.steps > 0)).toBe(true);
  });
});

describe('telling a failing model from the agent', () => {
  const say = (text: string, expected: TurnExpectation) => ({ say: text, expect: expected });
  const proposal = { calls: [{ tool: 'propose_workout', input: {} }] };
  const caseOf = (...turns: EvalCase['turns']): EvalCase => ({
    id: 'case',
    group: 'risky',
    turns,
  });
  const run = async (evalCase: EvalCase, resolverFor: Parameters<typeof runCase>[2]) => {
    const result = startResult(evalCase, models);
    await runCase(evalCase, result, resolverFor);
    return result.turns;
  };

  it('takes a planner failing with an API error for a model error', async () => {
    const silent = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const [turn] = await run(
      caseOf(say('zaproponuj trening', proposal)),
      (expected, previous, meter) => {
        const model = metered(
          new MockLanguageModelV4({
            doStream: [toolStep(expected.calls![0]!, previous), answer('Nie udało się.')],
            doGenerate: () => Promise.reject(new Error('overloaded')),
          }),
          meter,
        );
        return () => ({ provider: 'anthropic', model });
      },
    );
    silent.mockRestore();
    expect(turn?.calls[0]?.error).toBe('planner_failed');
    expect(turn?.modelError).toBe('overloaded');
    expect(turn?.problems).toEqual(['model error: overloaded']);
  });

  it('ignores an API error in a turn that passed: a retry got through', async () => {
    const [turn] = await run(
      caseOf(say('zaproponuj trening', proposal)),
      (expected, previous, meter) => {
        meter.error = 'overloaded';
        return replayResolver(expected, previous, meter);
      },
    );
    expect(turn?.modelError).toBeUndefined();
    expect(turn?.problems).toEqual([]);
  });

  it('keeps a wrong turn without an API error as behaviour', async () => {
    const [turn] = await run(caseOf(say('zaproponuj trening', proposal)), (_e, _p, meter) => {
      const model = metered(new MockLanguageModelV4({ doStream: [answer('Nie.')] }), meter);
      return () => ({ provider: 'anthropic', model });
    });
    expect(turn?.modelError).toBeUndefined();
    expect(turn?.problems).toEqual(['writes: expected [propose_workout], got []']);
  });

  it('shows nothing of the previous turn when a request is rejected', async () => {
    const turns = await run(
      caseOf(say('cześć', {}), say('i co?', {})),
      (expected, previous, meter) => {
        if (previous.length === 0) return replayResolver(expected, previous, meter);
        return () => {
          throw new ProviderUnavailable('anthropic');
        };
      },
    );
    expect(turns[1]?.reply).toBe('');
    expect(turns[1]?.modelError).toContain('HTTP 409');
  });
});

it('has unique case ids, for `--only` and the report', () => {
  const ids = CASES.map((evalCase) => evalCase.id);
  expect(new Set(ids).size).toBe(ids.length);
});
