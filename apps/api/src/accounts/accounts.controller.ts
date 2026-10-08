import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Database } from '../database.js';
import { SessionGuard } from '../identity/guard.js';
import type { AuthenticatedRequest } from '../identity/guard.js';

export const DATABASE = Symbol('DATABASE');
function accountName(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'name')) throw new BadRequestException('Informe somente o nome da conta.');
  const name = (body as Record<string, unknown>)['name'];
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) throw new BadRequestException('O nome deve conter de 1 a 100 caracteres.');
  return name.trim();
}
const projection = { id: true, name: true, currency: true, createdAt: true, updatedAt: true } as const;

@Controller('accounts')
@UseGuards(SessionGuard)
export class AccountsController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.db.financialAccount.findMany({ where: { userId: req.ownerId }, select: projection, orderBy: { createdAt: 'asc' } });
  }
  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.db.financialAccount.create({ data: { userId: req.ownerId, name: accountName(body) }, select: projection });
  }
  @Get(':id')
  async get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const account = await this.db.financialAccount.findUnique({ where: { id_userId: { id, userId: req.ownerId } }, select: projection });
    if (!account) throw new NotFoundException('Conta não encontrada.');
    return account;
  }
  @Patch(':id')
  async rename(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    const name = accountName(body);
    const result = await this.db.financialAccount.updateMany({ where: { id, userId: req.ownerId }, data: { name } });
    if (result.count !== 1) throw new NotFoundException('Conta não encontrada.');
    return this.get(req, id);
  }
}
