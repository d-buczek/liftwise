// The server of the e2e run: the built PWA and the API on a throwaway local D1, wiped each time,
// so a run never touches the dev database and always starts from the seed catalog.
import { execSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { E2E_PORT, E2E_TOKEN } from './token.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const API = fileURLToPath(new URL('../apps/api/', import.meta.url));
const PERSIST = '.wrangler/e2e';

const run = (command: string, cwd = API) => execSync(command, { cwd, stdio: 'inherit' });

run('pnpm --filter @liftwise/web build', ROOT);
rmSync(`${API}${PERSIST}`, { recursive: true, force: true });
run(`pnpm exec wrangler d1 migrations apply DB --local --persist-to ${PERSIST}`);

const hash = createHash('sha256').update(E2E_TOKEN).digest('hex');
const device = `INSERT INTO devices (id, name, token_hash, created_at) VALUES ('${randomUUID()}', 'e2e', '${hash}', '${new Date().toISOString()}');`;
run(`pnpm exec wrangler d1 execute DB --local --persist-to ${PERSIST} --command "${device}"`);

const server = spawn(`pnpm exec wrangler dev --port ${E2E_PORT} --persist-to ${PERSIST}`, {
  cwd: API,
  stdio: 'inherit',
  shell: true,
});
server.on('exit', (code) => process.exit(code ?? 0));
