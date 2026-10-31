import type { Exercise } from '@liftwise/core';
import { getTableColumns } from 'drizzle-orm';
import { exercises } from './schema';

// SQL of a seed-catalog migration (D40), written by scripts/seed-catalog.ts. An exercise
// already in D1 is kept as it is and takes no `seq`; a new one takes the next `seq`, like any
// server write, so devices pull it.
export function seedCatalogSql(catalog: Exercise[]): string[] {
  const columns = Object.entries(getTableColumns(exercises));
  const names = columns.map(([, column]) => `\`${column.name}\``).join(', ');
  return catalog.flatMap((exercise) => {
    const row: Record<string, unknown> = exercise;
    const id = quote(exercise.id);
    const values = columns.map(([key, column]) => {
      if (key === 'created_at' || key === 'updated_at')
        return "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
      if (key === 'seq') return '(SELECT `value` FROM `sync_counter` WHERE `id` = 1)';
      const value = row[key] ?? null;
      return value === null ? 'NULL' : quote(column.mapToDriverValue(value));
    });
    return [
      'INSERT INTO `sync_counter` (`id`, `value`) SELECT 1, 1 ' +
        `WHERE NOT EXISTS (SELECT 1 FROM \`exercises\` WHERE \`id\` = ${id}) ` +
        'ON CONFLICT (`id`) DO UPDATE SET `value` = `value` + 1;',
      `INSERT INTO \`exercises\` (${names}) VALUES (${values.join(', ')}) ON CONFLICT (\`id\`) DO NOTHING;`,
    ];
  });
}

function quote(value: unknown) {
  return typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
}
