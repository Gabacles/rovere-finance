import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Req, UseFilters, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../identity/guard.js';
import type { AuthenticatedRequest } from '../identity/guard.js';
import { IncomeErrors } from './incomes.controller.js';
import { IncomeRecurrencesService } from './recurrences.service.js';
import { RecurrenceLifecycleService } from './recurrence-lifecycle.service.js';

@Controller('income-recurrences')
@UseGuards(SessionGuard)
@UseFilters(new IncomeErrors())
export class IncomeRecurrencesController {
  constructor(@Inject(IncomeRecurrencesService) private readonly recurrences: IncomeRecurrencesService, @Inject(RecurrenceLifecycleService) private readonly lifecycle: RecurrenceLifecycleService) {}
  @Get() list(@Req() req: AuthenticatedRequest, @Query() query: unknown) { return this.recurrences.list(req.ownerId, query); }
  @Post() create(@Req() req: AuthenticatedRequest, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.recurrences.create(req.ownerId, body, key); }
  @Get(':id') get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.recurrences.get(req.ownerId, id); }
  @Get(':id/history') history(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.recurrences.history(req.ownerId, id); }
  @Post(':id/preview') preview(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) { return this.recurrences.preview(req.ownerId, id, body); }
  @Post(':id/generate') generate(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.recurrences.generate(req.ownerId, id, body, key); }
  @Get(':id/occurrences') occurrences(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query() query: unknown) { return this.lifecycle.occurrences(req.ownerId, id, query); }
  @Post(':id/change-preview') changePreview(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) { return this.lifecycle.preview(req.ownerId, id, body); }
  @Post(':id/change') change(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.lifecycle.change(req.ownerId, id, body, key); }
  @Post(':id/occurrences/:incomeId/change-preview') occurrencePreview(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('incomeId') incomeId: string, @Body() body: unknown) { return this.lifecycle.occurrencePreview(req.ownerId, id, incomeId, body); }
  @Post(':id/occurrences/:incomeId/change') occurrenceChange(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('incomeId') incomeId: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.lifecycle.occurrenceChange(req.ownerId, id, incomeId, body, key); }
}
