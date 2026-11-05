import { isFullId, matchesId, shortId } from '@liftwise/core';

// How a turn is scored against what a case expects: pure, so the rules have tests that cost nothing.

export type ToolCall = {
  tool: string;
  risk: 'read' | 'write' | 'risky';
  input: unknown;
  output?: unknown;
  // The call didn't run: a tool's `{ error }` or an input the SDK rejected.
  error?: string;
};

export type Turn = {
  calls: ToolCall[];
  reply: string;
  // The model or the provider failed: says nothing about how the agent behaves.
  modelError?: string;
};

// A value that isn't compared literally; `example` is what the replay model sends.
export class Matcher {
  label: string;
  example: unknown;
  test: (actual: unknown) => boolean;

  constructor(label: string, example: unknown, test: (actual: unknown) => boolean) {
    this.label = label;
    this.example = example;
    this.test = test;
  }
}

const show = (value: unknown) => (value === undefined ? 'nothing' : JSON.stringify(value));

// Present, with any value: for what the model works out itself.
export const any = (example: unknown) =>
  new Matcher('any value', example, (actual) => actual !== undefined && actual !== null);

export const anyOf = (...values: unknown[]) =>
  new Matcher(`one of ${show(values)}`, values[0], (actual) =>
    values.some((value) => differences(value, actual).length === 0),
  );

// One item for each value, taken greedily: list a more specific pattern before a looser one.
export const unordered = (values: unknown[]) =>
  new Matcher(`in any order ${show(values)}`, values, (actual) => {
    if (!Array.isArray(actual) || actual.length !== values.length) return false;
    const left: unknown[] = [...actual];
    return values.every((value) => {
      const index = left.findIndex((item) => differences(value, item).length === 0);
      if (index === -1) return false;
      left.splice(index, 1);
      return true;
    });
  });

export const text = (pattern: RegExp, example: string) =>
  new Matcher(`text matching ${String(pattern)}`, example, (actual) =>
    typeof actual === 'string' ? pattern.test(actual) : false,
  );

// Objects are compared as subsets: only the keys a case names matter. `undefined` means "not set"
// (a flag left out or false), arrays must have the same length.
export function differences(expected: unknown, actual: unknown, path = 'input'): string[] {
  if (expected instanceof Matcher) {
    return expected.test(actual)
      ? []
      : [`${path}: expected ${expected.label}, got ${show(actual)}`];
  }
  if (expected === undefined) {
    return actual === undefined || actual === null || actual === false
      ? []
      : [`${path}: expected nothing, got ${show(actual)}`];
  }
  // A full or a short id name the same record (D55).
  if (typeof expected === 'string' && isFullId(expected) && typeof actual === 'string') {
    return matchesId(expected, actual)
      ? []
      : [`${path}: expected ${show(expected)}, got ${show(actual)}`];
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      return [`${path}: expected ${expected.length} items, got ${show(actual)}`];
    }
    return expected.flatMap((item, index) => differences(item, actual[index], `${path}[${index}]`));
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object') {
      return [`${path}: expected an object, got ${show(actual)}`];
    }
    return Object.entries(expected).flatMap(([key, value]) =>
      differences(value, (actual as Record<string, unknown>)[key], `${path}.${key}`),
    );
  }
  return expected === actual ? [] : [`${path}: expected ${show(expected)}, got ${show(actual)}`];
}

// The input a replay sends: every matcher replaced by its example, ids short as the model sees them.
export function concrete(expected: unknown): unknown {
  if (expected instanceof Matcher) return concrete(expected.example);
  if (typeof expected === 'string' && isFullId(expected)) return shortId(expected);
  if (Array.isArray(expected)) return expected.map(concrete);
  if (expected !== null && typeof expected === 'object') {
    return Object.fromEntries(
      Object.entries(expected).map(([key, value]) => [key, concrete(value)]),
    );
  }
  return expected;
}

export type ExpectedCall = {
  tool: string;
  // A function when the value comes from an earlier turn (the group to undo).
  input: Input | ((previous: Turn[]) => Input);
};

type Input = Record<string, unknown>;

export type TurnExpectation = {
  // The write and risky calls that ran, all of them, in this order; none by default.
  calls?: ExpectedCall[];
  // Reads that must have run; an array is alternatives. Other reads are the model's choice.
  reads?: (ExpectedCall | ExpectedCall[])[];
  // The reply asks: no write or proposal, and a question mark or a request in the text.
  question?: boolean;
  reply?: Matcher;
};

export const inputOf = (call: ExpectedCall, previous: Turn[]): Input =>
  typeof call.input === 'function' ? call.input(previous) : call.input;

// A question mark, or a request for what's missing ("Podaj proszę ciężar.").
const ASKS = /\?|\b(podaj|napisz|powiedz|sprecyzuj|wybierz|potwierd)/i;

const names = (calls: { tool: string }[]) => `[${calls.map((call) => call.tool).join(', ')}]`;

// What's wrong with a turn; empty means it passed.
export function score(turn: Turn, expected: TurnExpectation, previous: Turn[] = []): string[] {
  if (turn.modelError) return [`model error: ${turn.modelError}`];

  const ran = turn.calls.filter((call) => call.error === undefined);
  const writes = ran.filter((call) => call.risk !== 'read');
  const wanted = expected.calls ?? [];
  const problems: string[] = [];

  if (names(writes) === names(wanted)) {
    writes.forEach((call, index) => {
      problems.push(...differences(inputOf(wanted[index]!, previous), call.input, call.tool));
      if (call.risk === 'risky' && (call.output as { status?: string })?.status !== 'pending') {
        problems.push(`${call.tool}: expected a pending proposal, got ${show(call.output)}`);
      }
    });
  } else {
    problems.push(`writes: expected ${names(wanted)}, got ${names(writes)}`);
  }

  for (const read of expected.reads ?? []) {
    const options = Array.isArray(read) ? read : [read];
    const found = options.some((option) =>
      ran.some(
        (call) =>
          call.tool === option.tool &&
          differences(inputOf(option, previous), call.input).length === 0,
      ),
    );
    if (!found) {
      problems.push(
        `reads: expected ${options.map((option) => `${option.tool} ${show(inputOf(option, previous))}`).join(' or ')}, got ${names(ran)}`,
      );
    }
  }

  if (expected.question && !ASKS.test(turn.reply)) {
    problems.push(`reply: expected a question, got ${show(turn.reply)}`);
  }
  if (expected.reply && !expected.reply.test(turn.reply)) {
    problems.push(`reply: expected ${expected.reply.label}, got ${show(turn.reply)}`);
  }
  return problems;
}
