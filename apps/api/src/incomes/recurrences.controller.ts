import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Req, UseFilters, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../identity/guard.js';
import type { AuthenticatedRequest } from '../identity/guard.js';
import { IncomeErrors } from './incomes.controller.js';
import { IncomeRecurrencesService } from './recurrences.service.js';

@Controller('income-recurrences')
@UseGuards(SessionGuard)
@UseFilters(new IncomeErrors())
export class IncomeRecurrencesController {
  constructor(@Inject(IncomeRecurrencesService) private readonly recurrences: IncomeRecurrencesService) {}
  @Get() list(@Req() req: AuthenticatedRequest, @Query() query: unknown) { return this.recurrences.list(req.ownerId, query); }
  @Post() create(@Req() req: AuthenticatedRequest, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.recurrences.create(req.ownerId, body, key); }
  @Get(':id') get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.recurrences.get(req.ownerId, id); }
  @Get(':id/history') history(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.recurrences.history(req.ownerId, id); }
  @Post(':id/preview') preview(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) { return this.recurrences.preview(req.ownerId, id, body); }
  @Post(':id/generate') generate(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.recurrences.generate(req.ownerId, id, body, key); }
}
