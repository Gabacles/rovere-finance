import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export function createDatabase(databaseUrl: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }, { schema: new URL(databaseUrl).searchParams.get('schema') ?? 'public' }) });
}
export type Database = ReturnType<typeof createDatabase>;
