import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export function createDatabase(databaseUrl: string) {
  const schema = new URL(databaseUrl).searchParams.get('schema') ?? 'public';
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('Invalid database schema.');
  // ORM and raw SQL must address the same schema, including isolated integration tests.
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, options: `-c search_path=${schema}` }, { schema }) });
}
export type Database = ReturnType<typeof createDatabase>;
