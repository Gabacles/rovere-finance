import { randomUUID } from 'node:crypto';
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { parseStatementPeriod } from '@rovere/domain';
import type { CardDTO, CardKind, CreditAccountDTO, StatementDTO } from '@rovere/domain';
import { DATABASE } from '../accounts/accounts.controller.js';
import type { Database } from '../database.js';

export function destinationError(status: number, code: string, message: string, field?: string): never {
  throw new HttpException({ code, message, requestId: randomUUID(), ...(field ? { violations: [{ field, code }] } : {}) }, status);
}
export function input(body: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !fields.includes(key))) {
    destinationError(400, 'INVALID_INPUT', 'Informe somente os campos permitidos.');
  }
  return body as Record<string, unknown>;
}
export function name(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) {
    destinationError(400, 'INVALID_NAME', 'O nome deve conter de 1 a 100 caracteres.', 'name');
  }
  return value.trim();
}
export function creationKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) {
    destinationError(400, 'INVALID_IDEMPOTENCY_KEY', 'Informe uma chave de idempotência válida.', 'Idempotency-Key');
  }
  return value;
}
function uniqueConflict(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002';
}
function conflict(): never { return destinationError(409, 'IDEMPOTENCY_CONFLICT', 'Esta chave já foi usada com outros dados.'); }
const creditProjection = { id: true, name: true, currency: true } as const;
const cardProjection = { id: true, creditAccountId: true, name: true, kind: true } as const;
const statementProjection = { id: true, creditAccountId: true, period: true, periodOrigin: true } as const;

@Injectable()
export class DestinationsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  list(userId: string) {
    return this.db.creditAccount.findMany({ where: { userId }, select: creditProjection, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  }
  async get(userId: string, id: string) {
    const account = await this.db.creditAccount.findUnique({ where: { id_userId: { id, userId } }, select: creditProjection });
    if (!account) destinationError(404, 'DESTINATION_NOT_FOUND', 'Destino não encontrado.');
    return account;
  }
  async createCredit(userId: string, body: unknown, key: unknown): Promise<CreditAccountDTO> {
    const accountName = name(input(body, ['name']).name);
    const token = creationKey(key);
    let record;
    try { record = await this.db.creditAccount.create({ data: { userId, name: accountName, creationKey: token }, select: creditProjection }); }
    catch (error) {
      if (!uniqueConflict(error)) throw error;
      record = await this.db.creditAccount.findUnique({ where: { userId_creationKey: { userId, creationKey: token } }, select: creditProjection });
      if (!record || record.name !== accountName) conflict();
    }
    return { ...record, currency: 'BRL' };
  }
  async cards(userId: string, creditAccountId: string) {
    await this.get(userId, creditAccountId);
    return this.db.card.findMany({ where: { userId, creditAccountId }, select: cardProjection, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  }
  async createCard(userId: string, creditAccountId: string, body: unknown, key: unknown): Promise<CardDTO> {
    const values = input(body, ['name', 'kind']);
    const cardName = name(values.name);
    if (!['physical', 'virtual', 'additional'].includes(values.kind as string)) {
      destinationError(400, 'INVALID_CARD_KIND', 'Escolha físico, virtual ou adicional.', 'kind');
    }
    const kind = values.kind as CardKind;
    const token = creationKey(key);
    await this.get(userId, creditAccountId);
    let record;
    try { record = await this.db.card.create({ data: { userId, creditAccountId, name: cardName, kind, creationKey: token }, select: cardProjection }); }
    catch (error) {
      if (!uniqueConflict(error)) throw error;
      record = await this.db.card.findUnique({ where: { userId_creationKey: { userId, creationKey: token } }, select: cardProjection });
      if (!record || record.name !== cardName || record.kind !== kind || record.creditAccountId !== creditAccountId) conflict();
    }
    return { ...record, kind };
  }
  async statements(userId: string, creditAccountId: string) {
    await this.get(userId, creditAccountId);
    return this.db.statement.findMany({ where: { userId, creditAccountId }, select: statementProjection, orderBy: { period: 'asc' } });
  }
  async createStatement(userId: string, creditAccountId: string, body: unknown, key: unknown): Promise<StatementDTO> {
    const values = input(body, ['period']);
    let period;
    try { period = parseStatementPeriod(values.period as string); }
    catch { destinationError(400, 'INVALID_STATEMENT_PERIOD', 'Informe a competência no formato AAAA-MM.', 'period'); }
    const token = creationKey(key);
    await this.get(userId, creditAccountId);
    let record;
    try { record = await this.db.statement.create({ data: { userId, creditAccountId, period, creationKey: token }, select: statementProjection }); }
    catch (error) {
      if (!uniqueConflict(error)) throw error;
      record = await this.db.statement.findUnique({ where: { userId_creationKey: { userId, creationKey: token } }, select: statementProjection });
      if (!record) destinationError(409, 'STATEMENT_PERIOD_EXISTS', 'Esta competência já está cadastrada. Selecione o período existente.', 'period');
      if (record.period !== period || record.creditAccountId !== creditAccountId) conflict();
    }
    return { ...record, period, periodOrigin: 'manual' };
  }
}
