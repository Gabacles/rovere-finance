import { XMLValidator } from 'fast-xml-parser';
import { decode, normalizeRow, sourcePrefix } from './normalize.js';
import { ImportFileError, LIMITS } from './types.js';
import type { Encoding, ParsedFile, ParsedRow, SourceBlock } from './types.js';

interface Node { name: string; text: string; children: Node[]; start: number; end: number }
const leaves = new Set(('CODE SEVERITY MESSAGE DTSERVER LANGUAGE DTPROFUP FIID ORG FID INTU.BID TRNUID CLTCOOKIE CURDEF BANKID BRANCHID ACCTID ACCTTYPE ACCTKEY DTSTART DTEND TRNTYPE DTPOSTED DTUSER DTAVAIL TRNAMT FITID CORRECTFITID CORRECTACTION SRVRTID CHECKNUM REFNUM SIC PAYEEID NAME MEMO BALAMT DTASOF MKTGINFO').split(' '));
function entities(text: string): string {
  if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(text)) throw new ImportFileError('INVALID_OFX_ENTITY');
  return text.replace(/&([^;]+);/g, (_match, entity: string) => {
    const predefined: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(predefined, entity)) return predefined[entity]!;
    const code = entity.startsWith('#x') ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    if (!Number.isInteger(code) || !([9, 10, 13].includes(code) || (code >= 32 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff))) throw new ImportFileError('INVALID_OFX_ENTITY');
    return String.fromCodePoint(code);
  });
}
function readTree(body: string, sgml: boolean): Node {
  if (/<!DOCTYPE|<!ENTITY/i.test(body)) throw new ImportFileError('UNSAFE_OFX_DECLARATION');
  const sentinel: Node = { name: '#root', text: '', children: [], start: 0, end: body.length };
  const stack = [sentinel]; let cursor = 0; let count = 0;
  for (const match of body.matchAll(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]*>/g)) {
    const token = match[0]; const offset = match.index;
    const current = stack.at(-1)!;
    current.text += entities(body.slice(cursor, offset));
    if (current.text.length > LIMITS.record) throw new ImportFileError('RECORD_TOO_LARGE');
    cursor = offset + token.length;
    if (token.startsWith('<!--')) continue;
    if (token.startsWith('<![CDATA[')) { current.text += token.slice(9, -3); if (current.text.length > LIMITS.record) throw new ImportFileError('RECORD_TOO_LARGE'); continue; }
    const tag = /^<(\/?)([A-Z][A-Z0-9_.]*)(\/?)>$/.exec(token);
    if (!tag) throw new ImportFileError('UNSUPPORTED_OFX_TAG');
    const name = tag[2]!; const closing = tag[1] === '/';
    if (sgml && leaves.has(current.name) && !(closing && name === current.name)) { current.end = offset; stack.pop(); }
    if (closing) {
      if (stack.length === 1 || stack.at(-1)!.name !== name) throw new ImportFileError('INVALID_OFX_STRUCTURE');
      stack.pop()!.end = cursor;
    } else {
      if (++count > LIMITS.nodes || stack.length > LIMITS.depth) throw new ImportFileError('OFX_COMPLEXITY_LIMIT');
      const node: Node = { name, text: '', children: [], start: offset, end: cursor };
      stack.at(-1)!.children.push(node);
      if (tag[3] !== '/') stack.push(node);
    }
  }
  sentinel.text += entities(body.slice(cursor));
  if (stack.length !== 1 || sentinel.text.trim() || sentinel.children.length !== 1 || sentinel.children[0]!.name !== 'OFX') throw new ImportFileError('INVALID_OFX_STRUCTURE');
  if (!sgml && XMLValidator.validate(body) !== true) throw new ImportFileError('INVALID_OFX_XML');
  for (const node of walk(sentinel)) if (node.children.length && node.text.trim()) throw new ImportFileError('INVALID_OFX_MIXED_CONTENT');
  return sentinel.children[0]!;
}
function* walk(node: Node): Generator<Node> { yield node; for (const child of node.children) yield* walk(child); }
function one(node: Node, name: string): Node | undefined {
  const matches = node.children.filter(child => child.name === name);
  if (matches.length > 1) throw new ImportFileError('DUPLICATE_OFX_ELEMENT');
  return matches[0];
}
function value(node: Node, name: string): string | undefined {
  const child = one(node, name);
  if (child?.children.length) throw new ImportFileError('INVALID_OFX_FIELD');
  return child?.text.trim();
}
export function parseOfx(bytes: Uint8Array, sourceId: string, encodingOverride?: Encoding): ParsedFile {
  sourcePrefix(sourceId);
  if (bytes.byteLength > LIMITS.bytes) throw new ImportFileError('FILE_TOO_LARGE');
  const prefix = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
  const declaredEncoding = /encoding\s*=\s*["']([^"']+)["']/i.exec(prefix)?.[1]?.toLowerCase();
  const charset = /^CHARSET:([^\r\n]+)/m.exec(prefix)?.[1]?.trim();
  const encoding = encodingOverride ?? (charset === '1252' || declaredEncoding === 'windows-1252' ? 'windows-1252' : 'utf-8');
  if (!encodingOverride && ((declaredEncoding && !['utf-8', 'windows-1252'].includes(declaredEncoding)) || (charset && !['1252', 'UTF-8', 'NONE'].includes(charset)))) throw new ImportFileError('UNSUPPORTED_ENCODING');
  const text = decode(bytes, encoding);
  const start = text.indexOf('<OFX>');
  if (start < 0) throw new ImportFileError('INVALID_OFX_HEADER');
  const header = text.slice(0, start); const body = text.slice(start);
  const sgml = /^OFXHEADER:100\s*$/m.test(header);
  const version = sgml ? /^VERSION:(\d+)\s*$/m.exec(header)?.[1] : /<\?OFX\s[^?]*\bVERSION="(\d+)"[^?]*\?>/.exec(header)?.[1];
  if (!version || !(sgml ? /^1\d{2}$/ : /^2\d{2}$/).test(version)) throw new ImportFileError('UNSUPPORTED_OFX_VERSION');
  if (sgml) {
    const declared = /^ENCODING:([^\r\n]+)/m.exec(header)?.[1]?.trim();
    if (!encodingOverride && declared && !['UTF-8', 'USASCII'].includes(declared)) throw new ImportFileError('UNSUPPORTED_ENCODING');
    if (!encodingOverride && declared === 'USASCII' && (!charset || charset === 'NONE') && /[^\x00-\x7F]/.test(body)) throw new ImportFileError('INVALID_ENCODING');
    if (!/^DATA:OFXSGML\s*$/m.test(header) || /^SECURITY:(?!NONE\s*$)/m.test(header) || /^COMPRESSION:(?!NONE\s*$)/m.test(header)) throw new ImportFileError('UNSUPPORTED_OFX_HEADER');
    if (header.split(/\r?\n/).some(line => line.trim() && !/^[A-Z]+:[^<>]*$/.test(line))) throw new ImportFileError('INVALID_OFX_HEADER');
  } else {
    if (header.replace(/<\?(?:xml|OFX)\s[^?]*\?>/g, '').trim()) throw new ImportFileError('INVALID_OFX_HEADER');
    if (!/\bOFXHEADER="200"/.test(header) || /\bSECURITY="(?!NONE")/.test(header)) throw new ImportFileError('UNSUPPORTED_OFX_HEADER');
  }
  const root = readTree(body, sgml);
  if (root.children.some(node => !['SIGNONMSGSRSV1', 'BANKMSGSRSV1', 'CREDITCARDMSGSRSV1'].includes(node.name))) throw new ImportFileError('UNSUPPORTED_OFX_MESSAGE');
  const institutions = [...walk(root)].filter(node => node.name === 'FI');
  if (institutions.length > 1) throw new ImportFileError('DUPLICATE_OFX_ELEMENT');
  for (const node of walk(root)) if (node.name === 'STATUS' && value(node, 'CODE') !== '0') throw new ImportFileError('OFX_RESPONSE_ERROR');
  const blocks: SourceBlock[] = []; const rows: ParsedRow[] = [];
  for (const [message, response, statement, accountTag, kind] of [
    ['BANKMSGSRSV1', 'STMTTRNRS', 'STMTRS', 'BANKACCTFROM', 'bank'],
    ['CREDITCARDMSGSRSV1', 'CCSTMTTRNRS', 'CCSTMTRS', 'CCACCTFROM', 'card'],
  ] as const) {
    const group = one(root, message);
    for (const reply of group?.children.filter(child => child.name === response) ?? []) {
      const stmt = one(reply, statement); if (!stmt) throw new ImportFileError('MISSING_OFX_STATEMENT');
      const account = one(stmt, accountTag); const list = one(stmt, 'BANKTRANLIST');
      if (!list) throw new ImportFileError('MISSING_TRANSACTION_LIST');
      if (list.children.some(node => !['DTSTART', 'DTEND', 'STMTTRN'].includes(node.name))) throw new ImportFileError('UNSUPPORTED_TRANSACTION_LIST');
      const blockId = `${sourceId}:${blocks.length + 1}`;
      const metadata: Record<string, string> = Object.create(null) as Record<string, string>;
      for (const key of ['ORG', 'FID']) { const entry = institutions[0] && value(institutions[0], key); if (entry) metadata[key] = entry; }
      for (const key of ['BANKID', 'BRANCHID', 'ACCTID', 'ACCTTYPE']) { const entry = account && value(account, key); if (entry) metadata[key] = entry; }
      const range: Record<string, string> = {};
      for (const key of ['DTSTART', 'DTEND']) { const entry = value(list, key); if (entry) range[key] = entry; }
      const currency = value(stmt, 'CURDEF');
      blocks.push({ id: blockId, kind, account: metadata, downloadRange: range, currency });
      for (const node of list.children.filter(child => child.name === 'STMTTRN')) {
        if (rows.length >= LIMITS.rows) throw new ImportFileError('TOO_MANY_ROWS');
        if (node.end - node.start > LIMITS.record) throw new ImportFileError('RECORD_TOO_LARGE');
        const name = value(node, 'NAME'); const memo = value(node, 'MEMO');
        rows.push(normalizeRow({ id: `${sourceId}:row:${rows.length + 1}`, blockId, ordinal: rows.length + 1, raw: body.slice(node.start, node.end),
          fields: node.children.map(child => [child.name, body.slice(child.start, child.end)] as const),
          date: value(node, 'DTPOSTED'), description: [name, memo && memo !== name ? memo : undefined].filter(Boolean).join('\n'),
          amount: value(node, 'TRNAMT'), currency, externalId: value(node, 'FITID'), dateFormat: 'OFX', decimal: '.', grouping: null, invert: false, kind,
          extraIssues: [
            ...(value(node, 'CORRECTFITID') ? [{ code: 'SOURCE_CORRECTION_REQUIRES_REVIEW', field: 'externalId', blocking: true }] : []),
            ...(one(node, 'CURRENCY') || one(node, 'ORIGCURRENCY') ? [{ code: 'CURRENCY_METADATA_REQUIRES_REVIEW', field: 'amount', blocking: true }] : []),
          ],
        }));
      }
    }
  }
  if (!blocks.length || [...walk(root)].filter(node => node.name === 'STMTTRN').length !== rows.length) throw new ImportFileError('UNSUPPORTED_OFX_MESSAGE');
  if (!rows.length) throw new ImportFileError('EMPTY_FILE');
  return { format: sgml ? 'ofx-sgml' : 'ofx-xml', adapterVersion: '1', encoding, sourceText: text, configuration: { version, header, encodingOverride }, blocks, rows };
}
