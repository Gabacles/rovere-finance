import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Req, UseFilters, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../identity/guard.js';
import type { AuthenticatedRequest } from '../identity/guard.js';
import { ExpenseErrors } from './expenses.controller.js';
import { ExpenseRecurrencesService } from './recurrences.service.js';

@Controller('expense-recurrences')
@UseGuards(SessionGuard)
@UseFilters(new ExpenseErrors())
export class ExpenseRecurrencesController {
  constructor(@Inject(ExpenseRecurrencesService) private readonly recurrences: ExpenseRecurrencesService) {}
  @Get() list(@Req() req: AuthenticatedRequest, @Query() query: unknown) { return this.recurrences.list(req.ownerId, query); }
  @Post() create(@Req() req: AuthenticatedRequest, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.recurrences.create(req.ownerId, body, key); }
  @Get(':id') get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.recurrences.get(req.ownerId, id); }
  @Get(':id/history') history(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.recurrences.history(req.ownerId, id); }
  @Get(':id/occurrences') occurrences(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query() query: unknown) { return this.recurrences.occurrences(req.ownerId, id, query); }
  @Post(':id/preview') preview(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) { return this.recurrences.preview(req.ownerId, id, body); }
  @Post(':id/confirm') confirm(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) { return this.recurrences.confirm(req.ownerId, id, body, key); }
}
