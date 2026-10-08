import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import type { Identity } from './auth.js';

export const IDENTITY = Symbol('IDENTITY');
export interface AuthenticatedRequest extends Request { ownerId: string }

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(IDENTITY) private readonly identity: Identity) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await this.identity.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) throw new UnauthorizedException('Sessão inválida ou expirada.');
    req.ownerId = session.user.id;
    return true;
  }
}
