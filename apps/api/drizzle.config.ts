import { defineConfig } from 'drizzle-kit';

// Only generates SQL; wrangler applies it (`db:migrate:local` / `db:migrate:remote`).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './migrations',
});
