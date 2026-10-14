import { readFile, writeFile, mkdir } from 'node:fs/promises';
import SwaggerParser from '@apidevtools/swagger-parser';
import { apiControllers } from '../apps/api/dist/app.js';
import { createIdentity } from '../apps/api/dist/identity/auth.js';
import { createDatabase } from '../apps/api/dist/database.js';
import { completeDocument } from '../apps/api/dist/openapi/document.js';

// Schema generation needs configuration/metadata only, never connects or migrates a DB.
const db = createDatabase('postgresql://fictitious:fictitious@127.0.0.1:1/rovere_test');
const identity = createIdentity(db, { databaseUrl: '', publicOrigin: 'http://localhost:5173', authSecret: 'documentation-only-fictitious-secret-12345678', smtpUrl: 'smtp://127.0.0.1:1', mailFrom: 'noreply@rovere.test', production: false });
try {
  const document = await completeDocument(apiControllers, identity);
  await SwaggerParser.validate(structuredClone(document), { resolve: { external: false } });
  const operationIds = Object.values(document.paths).flatMap(path => Object.values(path).map(op => op.operationId));
  if (new Set(operationIds).size !== operationIds.length) throw new Error('Duplicated operationIds');
  const snapshot = `${JSON.stringify(document, null, 2)}\n`;
  if (process.argv.includes('--write')) { await mkdir('docs/api', { recursive: true }); await writeFile('docs/api/openapi.json', snapshot); }
  else if (await readFile('docs/api/openapi.json', 'utf8') !== snapshot) throw new Error('OpenAPI snapshot is stale. Review contracts and run npm run api:docs:generate.');
  console.log(`OpenAPI 3.1.1 valid: ${operationIds.length} operations; route inventory and snapshot current; no database access.`);
} finally { await identity.close(); await db.$disconnect(); }
