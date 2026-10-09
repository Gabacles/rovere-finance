import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Controller, Get, Module, Inject, Injectable, Req, UseGuards, ServiceUnavailableException } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import { createDatabase } from './database.js';
import type { Database } from './database.js';
import type { AppConfig } from './config.js';
import { createIdentity } from './identity/auth.js';
import type { Identity } from './identity/auth.js';
import { IDENTITY, SessionGuard } from './identity/guard.js';
import type { AuthenticatedRequest } from './identity/guard.js';
import { AccountsController, DATABASE } from './accounts/accounts.controller.js';
import { CreditController } from './credit/credit.controller.js';
import { DestinationsService } from './credit/destinations.service.js';
import { ImportsController } from './imports/imports.controller.js';
import { ImportsService } from './imports/imports.service.js';
import { IMPORT_WORKER_ENABLED, ImportWorker } from './imports/worker.js';
import { ConfirmationService } from './imports/confirmation.service.js';
import { EntriesController } from './imports/entries.controller.js';
import { StatementsController } from './credit/statements.controller.js';
import { StatementsService } from './credit/statements.service.js';
import { ExpensesController } from './expenses/expenses.controller.js';
import { ExpensesService } from './expenses/expenses.service.js';

@Controller('health')
class HealthController {
  @Get()
  getHealth(): { status: 'ok'; service: 'rovere-api'; check: 'liveness' } {
    return { status: 'ok', service: 'rovere-api', check: 'liveness' };
  }
}

@Controller()
class IdentityController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() req: AuthenticatedRequest) {
    return this.db.user.findUniqueOrThrow({ where: { id: req.ownerId }, select: { id: true, name: true, email: true, emailVerified: true } });
  }
  @Get('ready')
  async ready() {
    try { await this.db.$queryRaw`SELECT 1`; return { status: 'ok' }; }
    catch { throw new ServiceUnavailableException('Serviço temporariamente indisponível.'); }
  }
}

@Injectable()
class Resources implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly db: Database, @Inject(IDENTITY) private readonly identity: Identity,
    @Inject(ImportWorker) private readonly imports: ImportWorker) {}
  async onApplicationShutdown() { await this.imports.stop(); await this.identity.close(); await this.db.$disconnect(); }
}

export async function createApp(config: AppConfig, db = createDatabase(config.databaseUrl)) {
  await db.$connect();
  const identity = createIdentity(db, config);
  @Module({
    controllers: [HealthController, IdentityController, AccountsController, CreditController, ImportsController, EntriesController, StatementsController, ExpensesController],
    providers: [{ provide: DATABASE, useValue: db }, { provide: IDENTITY, useValue: identity },
      { provide: IMPORT_WORKER_ENABLED, useValue: config.importsWorkerEnabled !== false }, SessionGuard, Resources, DestinationsService, ImportsService, ImportWorker, ConfirmationService, StatementsService, ExpensesService],
  })
  class AppModule {}
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'], bodyParser: false });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  const server: express.Express = app.getHttpAdapter().getInstance();
  server.disable('x-powered-by');
  server.use((req, res, next) => {
    // Only the direct peer is trusted. Incoming forwarded headers cannot bypass throttling.
    req.headers['x-rovere-client-ip'] = req.socket.remoteAddress ?? '127.0.0.1';
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const upload = req.method === 'POST' && req.path === '/api/imports' && req.is('multipart/form-data');
      if (req.headers.origin !== config.publicOrigin || !(req.is('application/json') || upload)) {
        res.status(403).json({ code: 'UNTRUSTED_REQUEST', message: 'Origem ou formato de requisição inválidos.' });
        return;
      }
    }
    next();
  });
  server.all('/api/auth/{*path}', toNodeHandler(identity.auth));
  server.use('/api/imports', express.json({ limit: '64kb' }));
  server.use(express.json({ limit: '16kb' }));
  server.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if ((req.path.startsWith('/api/imports') || req.path.startsWith('/api/credit-accounts') || req.path.startsWith('/api/expenses')) && error && typeof error === 'object' && 'status' in error && [400, 413].includes(error.status as number)) {
      res.status(error.status as number).json({ code: 'INVALID_REQUEST', message: 'Os dados enviados são inválidos ou excedem o limite.', requestId: randomUUID() });
      return;
    }
    next(error);
  });
  return app;
}
