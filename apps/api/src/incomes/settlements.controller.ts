import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Req, UseFilters, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../identity/guard.js';
import type { AuthenticatedRequest } from '../identity/guard.js';
import { IncomeErrors } from './incomes.controller.js';
import { IncomeSettlementsService } from './settlements.service.js';

@Controller('incomes/:incomeId/settlements')
@UseGuards(SessionGuard)
@UseFilters(new IncomeErrors())
export class IncomeSettlementsController {
  constructor(@Inject(IncomeSettlementsService) private readonly settlements: IncomeSettlementsService) {}
  @Get() get(@Req() req: AuthenticatedRequest, @Param('incomeId') id: string, @Query() query: unknown) { return this.settlements.get(req.ownerId, id, query); }
  @Post() allocate(@Req() req: AuthenticatedRequest, @Param('incomeId') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.settlements.allocate(req.ownerId, id, body, key); }
  @Post(':settlementId/reverse') reverse(@Req() req: AuthenticatedRequest, @Param('incomeId') id: string, @Param('settlementId') settlementId: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.settlements.reverse(req.ownerId, id, settlementId, body, key); }
}
@Controller('bank-entries')
@UseGuards(SessionGuard)
@UseFilters(new IncomeErrors())
export class BankSettlementSourcesController {
  constructor(@Inject(IncomeSettlementsService) private readonly settlements: IncomeSettlementsService) {}
  @Get(':id/settlement-source') source(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.settlements.source(req.ownerId, id); }
}
