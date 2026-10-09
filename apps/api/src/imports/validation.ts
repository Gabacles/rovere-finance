import { randomUUID } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import type { CsvProfile, Encoding } from '@rovere/importers';
import type { Prisma } from '../generated/prisma/client.js';

export function fail(status: number, code: string, message: string, violations?: readonly unknown[]): never {
  throw new HttpException({ code, message, requestId: randomUUID(), ...(violations ? { violations } : {}) }, status);
}
export function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail(400, 'INVALID_INPUT', 'Confira os campos informados.');
  return value as Record<string, unknown>;
}
export function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
export function key(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) fail(400, 'INVALID_IDEMPOTENCY_KEY', 'Informe uma chave de idempotência válida.');
  return value;
}
export function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(400, 'INVALID_VERSION', 'Informe a versão da revisão.');
  return value as number;
}
export type ParserConfiguration = { profile: CsvProfile } | { encoding?: Encoding };
export function configuration(format: unknown, value: unknown): ParserConfiguration {
  if (format === 'ofx') {
    const data = object(value, ['encoding']);
    if (data.encoding !== undefined && !['utf-8', 'windows-1252'].includes(data.encoding as string)) fail(400, 'INVALID_CONFIGURATION', 'Encoding não suportado.');
    return data as { encoding?: Encoding };
  }
  if (format !== 'csv') fail(400, 'INVALID_FORMAT', 'Selecione CSV ou OFX.');
  const data = object(value, ['profile']);
  const profile = object(data.profile, ['id', 'encoding', 'delimiter', 'headerLine', 'dateFormat', 'decimal', 'grouping', 'sign', 'currency', 'kind', 'columns']);
  const columns = object(profile.columns, ['date', 'description', 'amount', 'externalId', 'installmentNumber', 'installmentTotal', 'statementPeriod']);
  if (typeof profile.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(profile.id) ||
      !['utf-8', 'windows-1252'].includes(profile.encoding as string) || ![',', ';', '\t'].includes(profile.delimiter as string) ||
      !Number.isInteger(profile.headerLine) || (profile.headerLine as number) < 1 || (profile.headerLine as number) > 100 ||
      !['YMD', 'DMY', 'MDY'].includes(profile.dateFormat as string) || !['.', ','].includes(profile.decimal as string) ||
      ![null, '.', ','].includes(profile.grouping as null) || profile.grouping === profile.decimal ||
      !['as-is', 'invert'].includes(profile.sign as string) || profile.currency !== 'BRL' || !['bank', 'card'].includes(profile.kind as string) ||
      !['date', 'description', 'amount'].every(field => typeof columns[field] === 'string' && (columns[field] as string).length > 0) ||
      Object.values(columns).some(column => typeof column !== 'string' || column.length < 1 || column.length > 100) || new Set(Object.values(columns)).size !== Object.keys(columns).length) {
    fail(400, 'INVALID_CONFIGURATION', 'Confira o mapeamento e os formatos do CSV.');
  }
  return { profile: profile as unknown as CsvProfile };
}
