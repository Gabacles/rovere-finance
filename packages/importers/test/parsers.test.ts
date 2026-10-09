import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsv, parseOfx, ImportFileError, LIMITS } from '../src/index.ts';
import type { CsvProfile } from '../src/index.ts';

const bytes = (text: string) => new TextEncoder().encode(text);
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const profile: CsvProfile = { id: 'generic-br-v1', encoding: 'utf-8', delimiter: ';', headerLine: 1, dateFormat: 'DMY', decimal: ',', grouping: '.', sign: 'as-is', currency: 'BRL', kind: 'card',
  columns: { date: 'Data', description: 'Descrição', amount: 'Valor', externalId: 'ID', installmentNumber: 'Parcela', installmentTotal: 'Parcelas', statementPeriod: 'Fatura' } };
const simple: CsvProfile = { ...profile, kind: 'bank', columns: { date: 'Data', description: 'Descrição', amount: 'Valor' } };
const csv = (row: string, config = simple) => parseCsv(bytes(`Data;Descrição;Valor\n${row}`), 'batch', config);
const xml = () => fixture('card-220.ofx').toString('utf8');
const sgml = () => fixture('bank-102.ofx').toString('utf8');
function errorCode(action: () => unknown, code: string) {
  try { action(); throw new Error('Expected parser error'); } catch (error) {
    expect(error).toBeInstanceOf(ImportFileError); expect((error as ImportFileError).code).toBe(code);
  }
}
describe('CSV configured import', () => {
  it('preserves exact cents, IDs, explicit installments and invoice period', () => {
    const parsed = parseCsv(fixture('card.csv'), 'batch', profile);
    expect(parsed.rows).toHaveLength(2);
    const row = parsed.rows[0]!;
    expect(row.candidate.amount).toMatchObject({ state: 'confirmed', value: { cents: '-12000', currency: 'BRL' } });
    expect(row.candidate.externalId).toMatchObject({ value: '0001' });
    expect(row.candidate.installment).toMatchObject({ value: { number: 3, total: { value: 10 } } });
    expect(row.statementPeriod).toMatchObject({ value: '2026-10' });
    expect(row.candidate.statementId).toEqual({ state: 'unknown' });
    expect(row.candidate.issues).toEqual([]);
    expect(row.source.raw).toContain('08/10/2026;Loja fictícia;-120,00');
    expect(parsed.configuration).toEqual({ profile });
  });
  it('handles BOM, preamble, quotes, separators, escaped quotes and multiline descriptions', () => {
    const parsed = parseCsv(bytes('\uFEFFExportação fictícia\r\nData;Descrição;Valor\r\n08/10/2026;"Café; \"\"A\"\"\nRua B";-1,20\r\n'), 'batch', { ...simple, headerLine: 2 });
    expect(parsed.rows[0]!.candidate.description).toMatchObject({ value: 'Café; "A"\nRua B' });
  });
  it('accepts explicit Windows-1252, comma and tab layouts without guessing', () => {
    const data = Buffer.from('Data;Descrição;Valor\n08/10/2026;Café;-1,20', 'latin1');
    expect(parseCsv(data, 'batch', { ...simple, encoding: 'windows-1252' }).rows[0]!.candidate.description).toMatchObject({ value: 'Café' });
    for (const delimiter of [',', '\t'] as const) {
      const file = `Data${delimiter}Descrição${delimiter}Valor\n2026-10-08${delimiter}Loja${delimiter}-1.20`;
      expect(parseCsv(bytes(file), 'batch', { ...simple, delimiter, dateFormat: 'YMD', decimal: '.', grouping: null }).rows[0]!.candidate.amount).toMatchObject({ value: { cents: '-120' } });
    }
  });
  it('keeps invalid rows and independent valid rows for correction', () => {
    const parsed = csv('31/02/2026;Loja;12,345\n08/10/2026;Loja;-1,20\n08/10/2026;Loja;-1,20;extra');
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]!.candidate.issues).toHaveLength(2);
    expect(parsed.rows[1]!.candidate.issues).toHaveLength(0);
    expect(parsed.rows[2]!.candidate.issues).toContainEqual({ code: 'COLUMN_COUNT_MISMATCH', field: 'row', blocking: true });
  });
  it.each(['1e3', 'NaN', '12.34,56', '1,234', '92233720368547758,08', '', 'R$ 12,00'])('rejects ambiguous, imprecise or overflowing money: %s', amount => {
    expect(csv(`08/10/2026;Loja;${amount}`).rows[0]!.candidate.amount.state).toBe('unknown');
  });
  it('uses integer arithmetic at BIGINT boundaries and explicit sign configuration', () => {
    expect(csv('08/10/2026;Loja;92.233.720.368.547.758,07').rows[0]!.candidate.amount).toMatchObject({ value: { cents: '9223372036854775807' } });
    expect(csv('08/10/2026;Loja;-92233720368547758,08').rows[0]!.candidate.amount).toMatchObject({ value: { cents: '-9223372036854775808' } });
    expect(csv('08/10/2026;Loja;1,01', { ...simple, sign: 'invert' }).rows[0]!.candidate.amount).toMatchObject({ value: { cents: '-101' } });
    expect(csv('08/10/2026;Loja;-0,00').rows[0]!.candidate.amount).toMatchObject({ value: { cents: '0' } });
  });
  it('requires explicit date convention and never invents an invoice', () => {
    const row = csv('03/10/2026;Loja 03/10;-12,00', { ...simple, dateFormat: 'MDY', kind: 'card' }).rows[0]!;
    expect(row.candidate.postedOn).toMatchObject({ value: '2026-03-10' });
    expect(row.candidate.installment.state).toBe('unknown');
    expect(row.candidate.suggestions).toHaveLength(1);
    expect(row.candidate.issues).toContainEqual({ code: 'STATEMENT_PERIOD_REQUIRED', field: 'statementPeriod', blocking: true });
  });
  it('rejects invalid explicit installment information without losing its source', () => {
    const result = parseCsv(bytes(fixture('card.csv').toString().replace(';3;10;', ';11;10;')), 'batch', profile);
    expect(result.rows[0]!.candidate.installment.state).toBe('unknown');
    expect(result.rows[0]!.candidate.issues.some(issue => issue.code === 'INVALID_INSTALLMENT')).toBe(true);
  });
  it('rejects malformed structure, duplicated columns, bad profiles and undecodable bytes', () => {
    errorCode(() => csv('08/10/2026;"unclosed;-1'), 'INVALID_CSV_STRUCTURE');
    errorCode(() => parseCsv(bytes('Data;Data;Valor\n1;2;3'), 'batch', simple), 'INVALID_CSV_COLUMNS');
    errorCode(() => csv('1;2;3', { ...simple, decimal: '.', grouping: '.' }), 'INVALID_CSV_PROFILE');
    errorCode(() => parseCsv(new Uint8Array([255]), 'batch', simple), 'INVALID_ENCODING');
  });
});
describe('OFX bank/card families', () => {
  it('also parses card SGML and bank XML, preserving the original document', () => {
    const cardSgml = sgml().replaceAll('BANKMSGSRSV1', 'CREDITCARDMSGSRSV1').replaceAll('STMTTRNRS', 'CCSTMTTRNRS').replaceAll('STMTRS', 'CCSTMTRS').replaceAll('BANKACCTFROM', 'CCACCTFROM');
    const bankXml = xml().replaceAll('CREDITCARDMSGSRSV1', 'BANKMSGSRSV1').replaceAll('CCSTMTTRNRS', 'STMTTRNRS').replaceAll('CCSTMTRS', 'STMTRS').replaceAll('CCACCTFROM', 'BANKACCTFROM');
    expect(parseOfx(bytes(cardSgml), 'batch').blocks[0]!.kind).toBe('card');
    const result = parseOfx(bytes(bankXml), 'batch');
    expect(result.blocks[0]!.kind).toBe('bank');
    expect(result.sourceText).toBe(bankXml);
  });
  it('respects declared Windows-1252 and retains institution identity', () => {
    const source = sgml().replace('CHARSET:UTF-8', 'CHARSET:1252').replace('</SONRS>', '<FI><ORG>Fictícia<FID>0009</FI></SONRS>');
    const result = parseOfx(Buffer.from(source, 'latin1'), 'batch');
    expect(result.encoding).toBe('windows-1252');
    expect(result.blocks[0]!.account['FID']).toBe('0009');
    expect(result.rows[0]!.candidate.description).toMatchObject({ value: 'Loja fictícia\nCompra 03/10' });
  });
  it.each(['bank-102.ofx', 'card-220.ofx'])('parses %s without losing IDs, raw timezone or source sign', name => {
    const parsed = parseOfx(fixture(name), 'batch'); const row = parsed.rows[0]!;
    expect(row.candidate.postedOn).toMatchObject({ value: '2026-10-08' });
    expect(row.candidate.amount).toMatchObject({ value: { cents: '-12000' } });
    expect(row.candidate.externalId).toMatchObject({ value: '0001' });
    expect(row.source.raw).toContain('20261008120000[-3:BRT]');
    expect(row.candidate.installment.state).toBe('unknown');
    expect(row.candidate.suggestions).toHaveLength(1);
    expect(row.statementPeriod.state).toBe('unknown');
    expect(parsed.blocks[0]!.downloadRange).toEqual({ DTSTART: '20261001', DTEND: '20261031' });
    expect(parsed.blocks[0]!.account['ACCTID']).toMatch(/^000/);
  });
  it('decodes predefined and numeric entities as text and preserves unknown fields', () => {
    const parsed = parseOfx(bytes(xml().replace('</STMTTRN>', '<CUSTOM>abc&#233;</CUSTOM></STMTTRN>')), 'batch');
    expect(parsed.rows[0]!.candidate.description).toMatchObject({ value: 'Loja & Café fictícios\nCompra 03/10' });
    expect(parsed.rows[0]!.source.fields.some(([tag, raw]) => tag === 'CUSTOM' && raw.includes('&#233;'))).toBe(true);
  });
  it('keeps multiple accounts in separate blocks', () => {
    const source = xml(); const block = /<CCSTMTTRNRS>[\s\S]*?<\/CCSTMTTRNRS>/.exec(source)![0];
    const parsed = parseOfx(bytes(source.replace('</CREDITCARDMSGSRSV1>', `${block.replace('000456', '000789')}</CREDITCARDMSGSRSV1>`)), 'batch');
    expect(parsed.blocks.map(block => block.account['ACCTID'])).toEqual(['000456', '000789']);
    expect(parsed.rows[0]!.blockId).not.toBe(parsed.rows[1]!.blockId);
  });
  it('does not round amounts, convert foreign currency or manufacture missing fields', () => {
    const result = parseOfx(bytes(xml().replace('<CURDEF>BRL</CURDEF>', '<CURDEF>USD</CURDEF>').replace('<FITID>0001</FITID>', '')), 'batch');
    expect(result.rows[0]!.candidate.amount.state).toBe('unknown');
    expect(result.rows[0]!.candidate.externalId.state).toBe('unknown');
    const invalid = parseOfx(bytes(xml().replace('-120.00', '-120.001').replace('20261008120000[-3:BRT]', '20260230120000[-3:BRT]')), 'batch');
    expect(invalid.rows[0]!.candidate.amount.state).toBe('unknown');
    expect(invalid.rows[0]!.candidate.postedOn.state).toBe('unknown');
  });
  it('marks source corrections for review instead of overwriting prior facts', () => {
    const parsed = parseOfx(bytes(xml().replace('</STMTTRN>', '<CORRECTFITID>prior</CORRECTFITID></STMTTRN>')), 'batch');
    expect(parsed.rows[0]!.candidate.issues.some(issue => issue.code === 'SOURCE_CORRECTION_REQUIRES_REVIEW')).toBe(true);
  });
  it.each([
    ['DTD', (text: string) => text.replace('<OFX>', '<OFX><!DOCTYPE X SYSTEM "file:///secret">'), 'UNSAFE_OFX_DECLARATION'],
    ['entity bomb', (text: string) => text.replace('<OFX>', '<OFX><!ENTITY a "aaaa">'), 'UNSAFE_OFX_DECLARATION'],
    ['truncated XML', (text: string) => text.replace('</OFX>', ''), 'INVALID_OFX_STRUCTURE'],
    ['duplicate amount', (text: string) => text.replace('</STMTTRN>', '<TRNAMT>9.00</TRNAMT></STMTTRN>'), 'DUPLICATE_OFX_ELEMENT'],
    ['response error', (text: string) => text.replace('<CODE>0</CODE>', '<CODE>2000</CODE>'), 'OFX_RESPONSE_ERROR'],
    ['unsupported version', (text: string) => text.replace('VERSION="220"', 'VERSION="999"'), 'UNSUPPORTED_OFX_VERSION'],
    ['unsupported message', (text: string) => text.replace('</OFX>', '<INVSTMTMSGSRSV1></INVSTMTMSGSRSV1></OFX>'), 'UNSUPPORTED_OFX_MESSAGE'],
    ['unsupported pending records', (text: string) => text.replace('</BANKTRANLIST>', '<STMTTRNP></STMTTRNP></BANKTRANLIST>'), 'UNSUPPORTED_TRANSACTION_LIST'],
  ])('fails closed for %s', (_label, transform, code) => { errorCode(() => parseOfx(bytes(transform(xml())), 'batch'), code); });
  it('bounds depth before XML validation or recursive traversal', () => {
    errorCode(() => parseOfx(bytes(xml().replace('<OFX>', `<OFX>${'<X>'.repeat(40)}${'</X>'.repeat(40)}`)), 'batch'), 'OFX_COMPLEXITY_LIMIT');
  });
});
describe('batch limits and preservation', () => {
  it('parses 500 CSV purchases and 500 transactions in each OFX family without deduplication', () => {
    expect(csv(Array.from({ length: 500 }, () => '08/10/2026;Loja;-1,01').join('\n')).rows).toHaveLength(500);
    const cardRows = 'Data;Descrição;Valor;ID;Parcela;Parcelas;Fatura\n' + Array.from({ length: 500 }, (_, i) => `08/10/2026;Compra fictícia;-1,01;${i};;;2026-10`).join('\n');
    expect(parseCsv(bytes(cardRows), 'batch', profile).rows.every(row => row.candidate.issues.length === 0)).toBe(true);
    for (const source of [sgml(), xml()]) {
      const transaction = /<STMTTRN>[\s\S]*?<\/STMTTRN>/.exec(source)![0];
      const parsed = parseOfx(bytes(source.replace(transaction, transaction.repeat(500))), 'batch');
      expect(parsed.rows).toHaveLength(500);
      expect(new Set(parsed.rows.map(row => row.candidate.rowId)).size).toBe(500);
      expect(parsed.rows.every(row => row.candidate.amount.state === 'confirmed')).toBe(true);
    }
  });
  it('enforces file and row limits before returning partial success', () => {
    errorCode(() => parseCsv(new Uint8Array(LIMITS.bytes + 1), 'batch', simple), 'FILE_TOO_LARGE');
    errorCode(() => parseOfx(new Uint8Array(LIMITS.bytes + 1), 'batch'), 'FILE_TOO_LARGE');
    errorCode(() => csv('08/10/2026;Loja;1,00\n'.repeat(10001)), 'TOO_MANY_ROWS');
    errorCode(() => csv(`08/10/2026;${'x'.repeat(LIMITS.record + 1)};1,00`), 'INVALID_CSV_STRUCTURE');
    errorCode(() => parseOfx(bytes(xml().replace('Loja &amp; Café fictícios', 'x'.repeat(LIMITS.record + 1))), 'batch'), 'RECORD_TOO_LARGE');
    const source = xml(); const transaction = /<STMTTRN>[\s\S]*?<\/STMTTRN>/.exec(source)![0];
    errorCode(() => parseOfx(bytes(source.replace(transaction, transaction.repeat(10001))), 'batch'), 'TOO_MANY_ROWS');
  });
});
