import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Reporter, TestCase } from 'vite-plus/test/node';
import { renderReport, statusOf, unfinished, type CaseResult, type EvalMeta } from './report';

// Runs next to Vitest's own reporter: collects each case's result (the test's `meta`) and writes
// the report when the run ends. Nothing is written when no case ran (no key, a wrong provider).
export default class EvalReporter implements Reporter {
  private results: CaseResult[] = [];

  onTestCaseResult(testCase: TestCase) {
    const result = (testCase.meta() as EvalMeta).evalResult;
    if (!result) return;
    const { state, errors } = testCase.result();
    // A case that fails on what the model did has the problem in a turn; otherwise it never ended.
    const ended = state !== 'failed' || result.turns.some((turn) => turn.problems.length > 0);
    const message = errors?.[0]?.message.split('\n')[0] ?? 'did not finish';
    this.results.push(ended ? result : unfinished(result, message));
  }

  onTestRunEnd() {
    if (this.results.length === 0) return;
    const now = new Date();
    const stamp = now.toISOString().slice(0, 19).replace('T', '-').replaceAll(':', '');
    const dir = fileURLToPath(new URL('./reports/', import.meta.url));
    const base = `${dir}${this.results[0]?.models.provider ?? 'eval'}-${stamp}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${base}.md`, renderReport(this.results, now.toISOString().slice(0, 10)));
    writeFileSync(`${base}.json`, `${JSON.stringify(this.results, null, 2)}\n`);
    const passed = this.results.filter((result) => statusOf(result) === 'pass').length;
    console.log(`\nCompliance: ${passed}/${this.results.length}. Report: ${base}.md`);
  }
}
