import { randomUUID } from 'node:crypto';
import { Body, Catch, Controller, Get, Headers, HttpException, Inject, Param, Post, Query, Req, UseFilters, UseGuards } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { SessionGuard } from '../identity/guard.js';
import type { AuthenticatedRequest } from '../identity/guard.js';
import { PaymentsService } from './payments.service.js';
@Catch()
class PaymentErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const status = error instanceof HttpException ? error.getStatus() : 500; const payload = error instanceof HttpException ? error.getResponse() : {};
    if (status === 500) console.warn('STATEMENT_PAYMENT_FAILED');
    host.switchToHttp().getResponse<Response>().status(status).json(typeof payload === 'object' && 'code' in payload ? payload : { code: status === 401 ? 'UNAUTHORIZED' : 'PAYMENT_UNAVAILABLE', message: status === 401 ? 'Sessão inválida ou expirada.' : 'Não foi possível concluir. Tente novamente.', requestId: randomUUID() });
  }
}
@Controller('credit-accounts/:creditId/statements/:statementId/payments')
@UseGuards(SessionGuard)
@UseFilters(new PaymentErrors())
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}
  @Get() get(@Req() req: AuthenticatedRequest, @Param('creditId') creditId: string, @Param('statementId') id: string, @Query() query: unknown) { return this.payments.get(req.ownerId, creditId, id, query); }
  @Get('history') history(@Req() req: AuthenticatedRequest, @Param('creditId') creditId: string, @Param('statementId') id: string) { return this.payments.history(req.ownerId, creditId, id); }
  @Post('basis') basis(@Req() req: AuthenticatedRequest, @Param('creditId') creditId: string, @Param('statementId') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.payments.basis(req.ownerId, creditId, id, body, key); }
  @Post() allocate(@Req() req: AuthenticatedRequest, @Param('creditId') creditId: string, @Param('statementId') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.payments.allocate(req.ownerId, creditId, id, body, key); }
  @Post(':allocationId/reverse') reverse(@Req() req: AuthenticatedRequest, @Param('creditId') creditId: string, @Param('statementId') id: string, @Param('allocationId') allocationId: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.payments.reverse(req.ownerId, creditId, id, allocationId, body, key); }
}
@Controller('bank-entries')
@UseGuards(SessionGuard)
@UseFilters(new PaymentErrors())
export class PaymentSourcesController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}
  @Get(':id/payment-source') source(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.payments.source(req.ownerId, id); }
}
