import { randomUUID } from 'node:crypto';
import { Body, Catch, Controller, Get, Headers, HttpException, Inject, Param, Patch, Req, UseFilters, UseGuards } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { SessionGuard } from '../identity/guard.js';
import type { AuthenticatedRequest } from '../identity/guard.js';
import { CardChargesService } from './card-charges.service.js';

@Catch()
class ChargeErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const status = error instanceof HttpException ? error.getStatus() : 500; const payload = error instanceof HttpException ? error.getResponse() : {};
    if (status === 500) console.warn('CARD_CLASSIFICATION_FAILED');
    host.switchToHttp().getResponse<Response>().status(status).json(typeof payload === 'object' && 'code' in payload ? payload : { code: status === 401 ? 'UNAUTHORIZED' : 'CHARGE_UNAVAILABLE', message: status === 401 ? 'Sessão inválida ou expirada.' : 'Não foi possível concluir. Tente novamente.', requestId: randomUUID() });
  }
}
@Controller('card-charges')
@UseGuards(SessionGuard)
@UseFilters(new ChargeErrors())
export class CardChargesController {
  constructor(@Inject(CardChargesService) private readonly charges: CardChargesService) {}
  @Get(':id') get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.charges.get(req.ownerId, id); }
  @Get(':id/history') history(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.charges.history(req.ownerId, id); }
  @Patch(':id/classification') update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.charges.update(req.ownerId, id, body, key); }
}
