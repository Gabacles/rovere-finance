import { randomUUID } from 'node:crypto';
import { Body, Catch, Controller, Get, Headers, HttpException, Inject, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { SessionGuard } from '../identity/guard.js';
import type { AuthenticatedRequest } from '../identity/guard.js';
import { IncomesService } from './incomes.service.js';

@Catch()
export class IncomeErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const payload = error instanceof HttpException ? error.getResponse() : {};
    if (status === 500) console.warn('INCOME_COMMAND_FAILED');
    host.switchToHttp().getResponse<Response>().status(status).json(typeof payload === 'object' && 'code' in payload ? payload :
      { code: status === 401 ? 'UNAUTHORIZED' : 'INCOME_UNAVAILABLE', message: status === 401 ? 'Sessão inválida ou expirada.' : 'Não foi possível concluir. Tente novamente.', requestId: randomUUID() });
  }
}
@Controller('incomes')
@UseGuards(SessionGuard)
@UseFilters(new IncomeErrors())
export class IncomesController {
  constructor(@Inject(IncomesService) private readonly incomes: IncomesService) {}
  @Get() list(@Req() req: AuthenticatedRequest, @Query() query: unknown) { return this.incomes.list(req.ownerId, query); }
  @Post() create(@Req() req: AuthenticatedRequest, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.incomes.create(req.ownerId, body, key); }
  @Get(':id') get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.incomes.get(req.ownerId, id); }
  @Get(':id/history') history(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.incomes.history(req.ownerId, id); }
  @Patch(':id') update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.incomes.update(req.ownerId, id, body, key); }
  @Post(':id/cancel') cancel(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.incomes.cancel(req.ownerId, id, body, key); }
}
