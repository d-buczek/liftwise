// Creates the first device token (§6.8): `pnpm --filter @liftwise/api device:create <name> [--remote]`.
// Only the hash goes to D1, through wrangler; the token is printed once.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { v7 } from 'uuid';
import { generateToken, sha256Hex } from '../src/auth/tokens.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { remote: { type: 'boolean', default: false } },
});
const name = positionals.join(' ').trim();
if (!name) {
  console.error('Usage: device:create <name> [--remote]');
  process.exit(1);
}

const token = generateToken();
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql =
  'INSERT INTO devices (id, name, token_hash, created_at) VALUES ' +
  `(${[v7(), name, await sha256Hex(token), new Date().toISOString()].map(quote).join(', ')});`;

// Run wrangler's own entry with this Node: no shell, so no quoting issues on Windows.
const wrangler = fileURLToPath(new URL('../bin/wrangler.js', import.meta.resolve('wrangler')));
execFileSync(
  process.execPath,
  [wrangler, 'd1', 'execute', 'DB', values.remote ? '--remote' : '--local', '--command', sql],
  { stdio: ['ignore', 'ignore', 'inherit'] },
);

console.log(`Device "${name}" created. Token (shown once):\n\n${token}\n`);
