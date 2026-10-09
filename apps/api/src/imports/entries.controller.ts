import { Controller, Get, Inject, Query, Req, UseFilters, UseGuards } from '@nestjs/common';
import { DATABASE } from '../accounts/accounts.controller.js';
import type { Database } from '../database.js';
import { SessionGuard } from '../identity/guard.js';
import type { AuthenticatedRequest } from '../identity/guard.js';
import { ImportErrors } from './errors.js';
import { fail, object } from './validation.js';

@Controller('entries')
@UseGuards(SessionGuard)
@UseFilters(new ImportErrors())
export class EntriesController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  @Get()
  async list(@Req() req: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    const data = object(query, ['kind', 'accountId', 'statementId', 'page']);
    if (!['bank', 'card'].includes(data.kind as string) || typeof data.accountId !== 'string' || !data.accountId ||
      data.statementId !== undefined && typeof data.statementId !== 'string' || data.page !== undefined && (typeof data.page !== 'string' || !/^[1-9]\d{0,4}$/.test(data.page))) fail(400, 'INVALID_QUERY', 'Consulta inválida.');
    const page = data.page ? Number(data.page) : 1; const userId = req.ownerId; const accountId = data.accountId;
    if (data.kind === 'bank') {
      if (data.statementId !== undefined) fail(400, 'INVALID_QUERY', 'Fatura não pertence a movimento bancário.');
      if (!await this.db.financialAccount.findUnique({ where: { id_userId: { id: accountId, userId } } })) fail(404, 'DESTINATION_NOT_FOUND', 'Conta não encontrada.');
      const where = { userId, accountId };
      const values = await this.db.bankEntry.findMany({ where, orderBy: [{ postedOn: 'desc' }, { id: 'asc' }], skip: (page - 1) * 25, take: 25 });
      return { page, total: await this.db.bankEntry.count({ where }), rows: values.map(row => ({ id: row.id, kind: 'bank', accountId,
        postedOn: row.postedOn.toISOString().slice(0, 10), description: row.description, amount: { currency: row.currency, cents: row.cents.toString() }, notes: row.notes })) };
    }
    if (!await this.db.creditAccount.findUnique({ where: { id_userId: { id: accountId, userId } } })) fail(404, 'DESTINATION_NOT_FOUND', 'Crédito não encontrado.');
    if (data.statementId && !await this.db.statement.findFirst({ where: { id: data.statementId, userId, creditAccountId: accountId } })) fail(404, 'DESTINATION_NOT_FOUND', 'Fatura não encontrada.');
    const where = { userId, creditAccountId: accountId, ...(data.statementId ? { statementId: data.statementId } : {}) };
    const values = await this.db.cardCharge.findMany({ where, orderBy: [{ postedOn: 'desc' }, { id: 'asc' }], skip: (page - 1) * 25, take: 25 });
    return { page, total: await this.db.cardCharge.count({ where }), rows: values.map(row => ({ id: row.id, kind: 'card', accountId,
      statementId: row.statementId, cardId: row.cardId, postedOn: row.postedOn.toISOString().slice(0, 10), description: row.description,
      amount: { currency: row.currency, cents: row.cents.toString() }, installment: row.installment, notes: row.notes })) };
  }
}
