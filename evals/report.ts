// The compliance report of one run: pure, the reporter only writes it to disk.

export type Usage = { steps: number; input: number; cached: number; output: number };

export type TurnResult = {
  say: string;
  reply: string;
  calls: { tool: string; input: unknown; output?: unknown; error?: string }[];
  problems: string[];
  modelError?: string;
  usage: Usage;
  ms: number;
};

export type CaseResult = {
  id: string;
  group: string;
  // Which of `--runs N` this is, from 1.
  run: number;
  models: { provider: string; fast: string; planner: string };
  turns: TurnResult[];
};

// What a test leaves for the reporter.
export type EvalMeta = { evalResult?: CaseResult };

export const noUsage = (): Usage => ({ steps: 0, input: 0, cached: 0, output: 0 });

// A case that timed out or threw stays in the report, with the turns it finished.
export const unfinished = (result: CaseResult, message: string): CaseResult => ({
  ...result,
  turns: [
    ...result.turns,
    {
      say: '(the case did not finish)',
      reply: '',
      calls: [],
      problems: [message],
      modelError: message,
      usage: noUsage(),
      ms: 0,
    },
  ],
});

export type Status = 'pass' | 'fail' | 'error';

export const statusOf = ({ turns }: CaseResult): Status => {
  if (turns.some((turn) => turn.modelError)) return 'error';
  return turns.some((turn) => turn.problems.length > 0) ? 'fail' : 'pass';
};

export const totalUsage = (results: CaseResult[]): Usage => {
  const total = noUsage();
  for (const { usage } of results.flatMap((result) => result.turns)) {
    total.steps += usage.steps;
    total.input += usage.input;
    total.cached += usage.cached;
    total.output += usage.output;
  }
  return total;
};

const LABEL: Record<Status, string> = { pass: '✓', fail: '✗', error: 'error' };

// Text from the model or the case, safe inside a Markdown table cell.
const cell = (value: string) => value.replaceAll('|', '\\|').replaceAll(/\s+/g, ' ').trim();

const callList = (turn: TurnResult) =>
  turn.calls.map((call) => (call.error ? `${call.tool} (${call.error})` : call.tool)).join(', ');

const name = (result: CaseResult, many: boolean) =>
  many ? `${result.id} #${result.run}` : result.id;

export function renderReport(results: CaseResult[], date: string): string {
  const models = results[0]?.models;
  const count = (status: Status, list = results) =>
    list.filter((result) => statusOf(result) === status).length;
  const many = results.some((result) => result.run > 1);
  const usage = totalUsage(results);

  const groups = [...new Set(results.map((result) => result.group))].map((group) => {
    const list = results.filter((result) => result.group === group);
    return `| ${group} | ${count('pass', list)}/${list.length} | ${count('fail', list)} | ${count('error', list)} |`;
  });

  const problems = results
    .filter((result) => statusOf(result) !== 'pass')
    .flatMap((result) => [
      `### ${name(result, many)}`,
      '',
      ...result.turns.flatMap((turn) =>
        turn.problems.length > 0
          ? [
              `- Said: "${turn.say}"`,
              `- Tools: ${callList(turn) || 'none'}`,
              `- Reply: ${turn.reply || '(none)'}`,
              ...turn.problems.map((problem) => `- **${problem}**`),
            ]
          : [],
      ),
      '',
    ]);

  const rows = results.flatMap((result) =>
    result.turns.map(
      (turn) =>
        `| ${name(result, many)} | ${LABEL[turn.modelError ? 'error' : turn.problems.length > 0 ? 'fail' : 'pass']} | ${cell(turn.say)} | ${cell(callList(turn))} | ${cell(turn.reply)} | ${turn.usage.steps} | ${turn.usage.input} | ${turn.usage.cached} | ${turn.usage.output} | ${(turn.ms / 1000).toFixed(1)} |`,
    ),
  );

  return [
    `# Agent eval: ${models?.provider ?? '?'}, ${date}`,
    '',
    `Models: \`fast\` ${models?.fast ?? '?'}, \`planner\` ${models?.planner ?? '?'}.`,
    '',
    `**Compliance: ${count('pass')}/${results.length}** (mismatches: ${count('fail')}, model errors: ${count('error')}).`,
    '',
    `Tokens: input ${usage.input} (cached ${usage.cached}), output ${usage.output}; ${usage.steps} model calls.`,
    '',
    '| Group | Passed | Mismatches | Errors |',
    '|---|---|---|---|',
    ...groups,
    '',
    ...(problems.length > 0 ? ['## Differences', '', ...problems] : []),
    '## All turns',
    '',
    '| Case | Result | Said | Tools | Reply | Steps | Input | Cached | Output | s |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}
