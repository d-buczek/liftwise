import { describe, expect, it } from 'vite-plus/test';
import { renderReport, statusOf, unfinished, type CaseResult } from './report';
import { any, anyOf, concrete, differences, score, text, unordered, type ToolCall } from './score';

const log = (fields: Partial<ToolCall> = {}): ToolCall => ({
  tool: 'log_sets',
  risk: 'write',
  input: { exercise_id: 'bench', sets: [{ weight_kg: 24, reps: 10, rir: 1 }] },
  output: { groupId: 'g1' },
  ...fields,
});

const expectLog = {
  calls: [
    { tool: 'log_sets', input: { exercise_id: 'bench', sets: [{ weight_kg: 24, reps: 10 }] } },
  ],
};

const turn = (...calls: ToolCall[]) => ({ calls, reply: 'Zapisane.' });

describe('comparing inputs', () => {
  it('takes objects as subsets and arrays by length', () => {
    expect(differences({ a: 1 }, { a: 1, b: 2 })).toEqual([]);
    expect(differences({ a: 1 }, { a: 2 })).toEqual(['input.a: expected 1, got 2']);
    expect(differences([1], [1, 2])).toEqual(['input: expected 1 items, got [1,2]']);
    expect(differences({ a: [{ b: 1 }] }, { a: [{ b: 2 }] })).toEqual([
      'input.a[0].b: expected 1, got 2',
    ]);
  });

  it('takes undefined as a value not set', () => {
    expect(differences({ light: undefined }, {})).toEqual([]);
    expect(differences({ light: undefined }, { light: false })).toEqual([]);
    expect(differences({ light: undefined }, { light: true })).toHaveLength(1);
  });

  it('takes a full and a short id for the same record', () => {
    const id = '01a18d97-e1d7-701f-ad35-058b1ee45aed';
    expect(differences({ set_id: id }, { set_id: id })).toEqual([]);
    expect(differences({ set_id: id }, { set_id: '1ee45aed' })).toEqual([]);
    expect(differences({ set_id: id }, { set_id: '2ee45aed' })).toHaveLength(1);
    expect(differences({ set_id: id }, {})).toHaveLength(1);
    expect(concrete({ set_id: id, ids: [unordered([id])] })).toEqual({
      set_id: '1ee45aed',
      ids: [['1ee45aed']],
    });
  });

  it('applies matchers', () => {
    expect(differences(any(1), 5)).toEqual([]);
    expect(differences(any(1), undefined)).toHaveLength(1);
    expect(differences(anyOf('a', 'b'), 'b')).toEqual([]);
    expect(differences(anyOf('a', 'b'), 'c')).toHaveLength(1);
    expect(differences(unordered(['a', 'b']), ['b', 'a'])).toEqual([]);
    expect(differences(unordered(['a', 'b']), ['a'])).toHaveLength(1);
    expect(differences(unordered(['a', 'a', 'b']), ['a', 'b', 'b'])).toHaveLength(1);
    expect(differences(unordered([{ id: 'a' }]), [{ id: 'a', more: 1 }])).toEqual([]);
    expect(differences(text(/rano/i, 'x'), 'Woli trenować rano')).toEqual([]);
    expect(differences(text(/rano/i, 'x'), 7)).toHaveLength(1);
  });

  it('replaces matchers with their examples for the replay', () => {
    expect(concrete({ a: any(1), b: [anyOf('x', 'y')], c: unordered([text(/z/, 'z')]) })).toEqual({
      a: 1,
      b: ['x'],
      c: ['z'],
    });
  });
});

describe('scoring a turn', () => {
  it('passes the expected write, with reads of the model on top', () => {
    const read = log({ tool: 'find_exercise', risk: 'read', input: { query: 'x' } });
    expect(score(turn(read, log()), expectLog)).toEqual([]);
  });

  it('fails a wrong argument, a missing and an extra write', () => {
    expect(score(turn(log({ input: { exercise_id: 'row', sets: [{}] } })), expectLog)).toEqual([
      'log_sets.exercise_id: expected "bench", got "row"',
      'log_sets.sets[0].weight_kg: expected 24, got nothing',
      'log_sets.sets[0].reps: expected 10, got nothing',
    ]);
    expect(score(turn(), expectLog)).toEqual(['writes: expected [log_sets], got []']);
    expect(score(turn(log(), log()), expectLog)).toEqual([
      'writes: expected [log_sets], got [log_sets, log_sets]',
    ]);
  });

  it('fails a write where none is expected', () => {
    expect(score(turn(log()), {})).toEqual(['writes: expected [], got [log_sets]']);
  });

  it('ignores a failed call the model corrected', () => {
    const failed = log({ input: { exercise_id: 'x' }, error: 'exercise_not_found' });
    expect(score(turn(failed, log()), expectLog)).toEqual([]);
    expect(score(turn(failed), expectLog)).toEqual(['writes: expected [log_sets], got []']);
  });

  it('wants a risky call to be a pending proposal', () => {
    const risky = { tool: 'delete_sets', risk: 'risky' as const, input: {} };
    const expected = { calls: [{ tool: 'delete_sets', input: {} }] };
    expect(score(turn({ ...risky, output: { status: 'pending' } }), expected)).toEqual([]);
    expect(score(turn({ ...risky, output: { status: 'confirmed' } }), expected)).toHaveLength(1);
  });

  it('wants one of the alternatives of a read', () => {
    const read = (tool: string) => ({ tool, risk: 'read' as const, input: { exercise_id: 'row' } });
    const expected = {
      reads: [
        [
          { tool: 'get_records', input: { exercise_id: 'row' } },
          { tool: 'get_exercise_history', input: { exercise_id: 'row' } },
        ],
      ],
    };
    expect(score(turn(read('get_exercise_history')), expected)).toEqual([]);
    expect(score(turn(read('get_balance')), expected)).toHaveLength(1);
    expect(
      score(turn(read('get_exercise_history')), {
        reads: [{ tool: 'get_exercise_history', input: { exercise_id: 'bench' } }],
      }),
    ).toHaveLength(1);
  });

  it('wants a question without a write', () => {
    const expected = { question: true };
    expect(score({ calls: [], reply: 'Które wyciskanie?' }, expected)).toEqual([]);
    expect(score({ calls: [], reply: 'Podaj proszę ciężar.' }, expected)).toEqual([]);
    expect(score({ calls: [], reply: 'Wpisz proszę: potwierdź to.' }, expected)).toEqual([]);
    expect(score({ calls: [], reply: 'Zapisane.' }, expected)).toHaveLength(1);
    expect(score({ calls: [log()], reply: 'Które?' }, expected)).toEqual([
      'writes: expected [], got [log_sets]',
    ]);
  });

  it('checks the reply', () => {
    const expected = { reply: text(/\b26\b/, '26 kg') };
    expect(score({ calls: [], reply: 'Wczoraj, 26 kg.' }, expected)).toEqual([]);
    expect(score({ calls: [], reply: 'Wczoraj, 126 kg.' }, expected)).toHaveLength(1);
  });

  it('takes an input from an earlier turn', () => {
    const undo = { tool: 'undo_change', risk: 'write' as const, input: { group_id: 'g1' } };
    const expected = {
      calls: [
        {
          tool: 'undo_change',
          input: (previous: { calls: ToolCall[] }[]) => ({
            group_id: (previous[0]!.calls[0]!.output as { groupId: string }).groupId,
          }),
        },
      ],
    };
    expect(score(turn(undo), expected, [turn(log())])).toEqual([]);
    expect(score(turn(undo), expected, [turn(log({ output: { groupId: 'g2' } }))])).toHaveLength(1);
  });

  it('reports a model failure instead of behaviour', () => {
    expect(score({ calls: [], reply: '', modelError: 'model_error' }, { question: true })).toEqual([
      'model error: model_error',
    ]);
  });
});

describe('the report', () => {
  const models = { provider: 'anthropic', fast: 'fast-id', planner: 'planner-id' };
  const usage = { steps: 2, input: 100, cached: 60, output: 10 };
  const result = (id: string, fields: Partial<CaseResult['turns'][number]> = {}): CaseResult => ({
    id,
    group: 'logging',
    run: 1,
    models,
    turns: [{ say: 'a | b', reply: 'Ok.', calls: [], problems: [], usage, ms: 1500, ...fields }],
  });

  it('tells a failure from a model error', () => {
    expect(statusOf(result('a'))).toBe('pass');
    expect(statusOf(result('a', { problems: ['x'] }))).toBe('fail');
    expect(statusOf(result('a', { problems: ['x'], modelError: 'y' }))).toBe('error');
  });

  it('sums up per group and lists the differences', () => {
    const report = renderReport(
      [
        result('ok'),
        result('wrong', { problems: ['writes: expected [a], got []'] }),
        result('down', { problems: ['model error: 401'], modelError: '401' }),
      ],
      '2026-11-05',
    );
    expect(report).toContain('# Agent eval: anthropic, 2026-11-05');
    expect(report).toContain('`fast` fast-id, `planner` planner-id');
    expect(report).toContain('**Compliance: 1/3** (mismatches: 1, model errors: 1)');
    expect(report).toContain('Tokens: input 300 (cached 180), output 30; 6 model calls.');
    expect(report).toContain('| logging | 1/3 | 1 | 1 |');
    expect(report).toContain('### wrong');
    expect(report).toContain('- **writes: expected [a], got []**');
    expect(report).toContain('a \\| b');
    expect(report).not.toContain('### ok');
  });

  it('keeps a case that did not finish, with its turns, as an error', () => {
    const report = renderReport([unfinished(result('hung'), 'Test timed out')], '2026-11-05');
    expect(statusOf(unfinished(result('hung'), 'Test timed out'))).toBe('error');
    expect(report).toContain('**Compliance: 0/1** (mismatches: 0, model errors: 1)');
    expect(report).toContain('- **Test timed out**');
    expect(report).toContain('a \\| b');
  });

  it('numbers the runs when there are several', () => {
    const second = { ...result('a'), run: 2 };
    expect(renderReport([result('a'), second], '2026-11-05')).toContain('| a #2 |');
  });
});
