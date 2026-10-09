import { Body, Controller, Get, Headers, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../identity/guard.js';
import type { AuthenticatedRequest } from '../identity/guard.js';
import { DestinationsService } from './destinations.service.js';

@Controller('credit-accounts')
@UseGuards(SessionGuard)
export class CreditController {
  constructor(@Inject(DestinationsService) private readonly destinations: DestinationsService) {}
  @Get()
  list(@Req() req: AuthenticatedRequest) { return this.destinations.list(req.ownerId); }
  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() body: unknown, @Headers('idempotency-key') key: unknown) {
    return this.destinations.createCredit(req.ownerId, body, key);
  }
  @Get(':id')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.destinations.get(req.ownerId, id); }
  @Get(':id/cards')
  cards(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.destinations.cards(req.ownerId, id); }
  @Post(':id/cards')
  createCard(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) {
    return this.destinations.createCard(req.ownerId, id, body, key);
  }
  @Get(':id/statements')
  statements(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.destinations.statements(req.ownerId, id); }
  @Post(':id/statements')
  createStatement(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown) {
    return this.destinations.createStatement(req.ownerId, id, body, key);
  }
}
