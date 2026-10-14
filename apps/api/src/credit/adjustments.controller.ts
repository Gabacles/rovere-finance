import { randomUUID } from 'node:crypto';
import { Body, Catch, Controller, Get, Headers, HttpException, Inject, Param, Post, Req, UseFilters, UseGuards } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { SessionGuard } from '../identity/guard.js';
import type { AuthenticatedRequest } from '../identity/guard.js';
import { AdjustmentsService } from './adjustments.service.js';
@Catch()
class AdjustmentErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) { const status = error instanceof HttpException ? error.getStatus() : 500; const payload = error instanceof HttpException ? error.getResponse() : {}; if (status === 500) console.warn('CARD_ADJUSTMENT_FAILED'); host.switchToHttp().getResponse<Response>().status(status).json(typeof payload === 'object' && 'code' in payload ? payload : { code: status === 401 ? 'UNAUTHORIZED' : 'ADJUSTMENT_UNAVAILABLE', message: status === 401 ? 'Sessão inválida ou expirada.' : 'Não foi possível concluir. Tente novamente.', requestId: randomUUID() }); }
}
@Controller('credit-accounts/:creditId/statements/:statementId/adjustments')
@UseGuards(SessionGuard)
@UseFilters(new AdjustmentErrors())
export class AdjustmentsController {
  constructor(@Inject(AdjustmentsService) private readonly adjustments: AdjustmentsService) {}
  @Post() create(@Req() req: AuthenticatedRequest, @Param('creditId') creditId: string, @Param('statementId') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.adjustments.create(req.ownerId, creditId, id, body, key); }
  @Post(':chargeId/reverse') reverse(@Req() req: AuthenticatedRequest, @Param('creditId') creditId: string, @Param('statementId') id: string, @Param('chargeId') chargeId: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.adjustments.create(req.ownerId, creditId, id, body, key, chargeId); }
  @Get('history') history(@Req() req: AuthenticatedRequest, @Param('creditId') creditId: string, @Param('statementId') id: string) { return this.adjustments.history(req.ownerId, creditId, id); }
}
@Controller('expenses/:expenseId/refunds')
@UseGuards(SessionGuard)
@UseFilters(new AdjustmentErrors())
export class RefundsController {
  constructor(@Inject(AdjustmentsService) private readonly adjustments: AdjustmentsService) {}
  @Post() link(@Req() req: AuthenticatedRequest, @Param('expenseId') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.adjustments.refund(req.ownerId, id, body, key); }
  @Post(':chargeId/remove') remove(@Req() req: AuthenticatedRequest, @Param('expenseId') id: string, @Param('chargeId') chargeId: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.adjustments.refund(req.ownerId, id, body, key, chargeId); }
  @Get('history') history(@Req() req: AuthenticatedRequest, @Param('expenseId') id: string) { return this.adjustments.history(req.ownerId, undefined, undefined, id); }
}
