import { randomUUID } from 'node:crypto';
import { Body, Catch, Controller, Get, Headers, HttpException, Inject, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { SessionGuard } from '../identity/guard.js';
import type { AuthenticatedRequest } from '../identity/guard.js';
import { ExpensesService } from './expenses.service.js';
import { InstallmentsService } from './installments.service.js';

@Catch()
class ExpenseErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const payload = error instanceof HttpException ? error.getResponse() : {};
    if (status === 500) console.warn('EXPENSE_COMMAND_FAILED');
    host.switchToHttp().getResponse<Response>().status(status).json(typeof payload === 'object' && 'code' in payload ? payload :
      { code: status === 401 ? 'UNAUTHORIZED' : 'EXPENSE_UNAVAILABLE', message: status === 401 ? 'Sessão inválida ou expirada.' : 'Não foi possível concluir. Tente novamente.', requestId: randomUUID() });
  }
}
@Controller('expenses')
@UseGuards(SessionGuard)
@UseFilters(new ExpenseErrors())
export class ExpensesController {
  constructor(@Inject(ExpensesService) private readonly expenses: ExpensesService, @Inject(InstallmentsService) private readonly installments: InstallmentsService) {}
  @Get() list(@Req() req: AuthenticatedRequest, @Query() query: unknown) { return this.expenses.list(req.ownerId, query); }
  @Post() create(@Req() req: AuthenticatedRequest, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.expenses.create(req.ownerId, body, key); }
  @Get(':id') get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.expenses.get(req.ownerId, id); }
  @Get(':id/history') history(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.expenses.history(req.ownerId, id); }
  @Patch(':id') update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.expenses.update(req.ownerId, id, body, key); }
  @Post(':id/installment-plan') plan(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.installments.create(req.ownerId, id, body, key); }
  @Post(':id/installment-plan/matches') match(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.installments.match(req.ownerId, id, body, key); }
  @Post(':id/installment-plan/matches/:number/remove') remove(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('number') number: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.installments.remove(req.ownerId, id, number, body, key); }
}
