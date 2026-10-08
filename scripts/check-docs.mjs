import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const errors = [];
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', '.git', 'dist', 'coverage', 'test-results', 'playwright-report'].includes(entry.name)) return [];
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? walk(path) : path.endsWith('.md') ? [path] : [];
  });
}
const markdownFiles = walk(root);
for (const path of markdownFiles) {
  if (path.includes(`${resolve(root, 'docs/archive')}`)) continue;
  const text = readFileSync(path, 'utf8');
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    if (!existsSync(resolve(dirname(path), decodeURIComponent(target)))) {
      errors.push(`${relative(root, path)}: missing link ${target}`);
    }
  }
}
const index = readFileSync('PLANEJAMENTO_ARQUITETURA.md', 'utf8');
const expectedHash = index.match(/SHA-256[^`]+`([a-f0-9]{64})`/)?.[1];
const actualHash = createHash('sha256').update(readFileSync('docs/archive/2026-10-08-planejamento-original.md')).digest('hex');
if (expectedHash !== actualHash) errors.push('Original planning archive hash mismatch.');
const required = ['scope', 'architecture', 'domain', 'imports', 'ux', 'integrations', 'security', 'quality', 'roadmap', 'contracts', 'progress'];
for (const name of required) if (!existsSync(`docs/${name}.md`)) errors.push(`Missing canonical document: ${name}`);
const ids = new Set();
let count = 0;
for (const file of ['docs/tasks/phase-0.md', 'docs/tasks/phase-1.md']) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/^## \[([ x])\] (RF-\d+) ([\s\S]*?)(?=^## |$(?![\s\S]))/gm)) {
    const [, checked, id, body] = match;
    count++;
    if (ids.has(id)) errors.push(`Duplicate task ID: ${id}`);
    ids.add(id);
    for (const field of ['Estado:', 'Descrição:', 'Contexto/objetivo:', 'Dependências:', 'Atividades e aceite:', 'Testes necessários:', 'Implementação:']) {
      if (!body.includes(field)) errors.push(`${id}: missing ${field}`);
    }
    if (!/^- Evidências(?: \([^\n]+\))?: /m.test(body)) errors.push(`${id}: missing evidence field`);
    const status = body.match(/Estado: (.+)/)?.[1].trim();
    if (!['pendente', 'em andamento', 'bloqueada', 'concluída'].includes(status)) errors.push(`${id}: invalid state`);
    if ((checked === 'x') !== (status === 'concluída')) errors.push(`${id}: checkbox/state mismatch`);
    if (status === 'concluída' && body.includes('[ ]')) errors.push(`${id}: incomplete acceptance criteria`);
  }
}
if (count === 0) errors.push('No task entries found.');
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Documentation OK: ${markdownFiles.length} Markdown files, ${count} tasks, links and original SHA-256 verified.`);
