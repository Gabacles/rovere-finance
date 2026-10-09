import { randomUUID } from 'node:crypto';
import { Body, Catch, Controller, Get, HttpException, Inject, Param, Patch, Req, UseFilters, UseGuards } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { SessionGuard } from '../identity/guard.js';
import type { AuthenticatedRequest } from '../identity/guard.js';
import { StatementsService } from './statements.service.js';

@Catch()
class StatementErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const payload = error instanceof HttpException ? error.getResponse() : {};
    if (status === 500) console.warn('STATEMENT_UPDATE_FAILED');
    host.switchToHttp().getResponse<Response>().status(status).json(typeof payload === 'object' && 'code' in payload ? payload :
      { code: status === 401 ? 'UNAUTHORIZED' : 'STATEMENT_UNAVAILABLE', message: status === 401 ? 'Sessão inválida ou expirada.' : 'Não foi possível concluir. Tente novamente.', requestId: randomUUID() });
  }
}
@Controller('credit-accounts/:creditId/statements/:statementId')
@UseGuards(SessionGuard)
@UseFilters(new StatementErrors())
export class StatementsController {
  constructor(@Inject(StatementsService) private readonly statements: StatementsService) {}
  @Get()
  get(@Req() req: AuthenticatedRequest, @Param('creditId') creditId: string, @Param('statementId') statementId: string) { return this.statements.get(req.ownerId, creditId, statementId); }
  @Get('history')
  history(@Req() req: AuthenticatedRequest, @Param('creditId') creditId: string, @Param('statementId') statementId: string) { return this.statements.history(req.ownerId, creditId, statementId); }
  @Patch()
  update(@Req() req: AuthenticatedRequest, @Param('creditId') creditId: string, @Param('statementId') statementId: string, @Body() body: unknown) { return this.statements.update(req.ownerId, creditId, statementId, body); }
}
