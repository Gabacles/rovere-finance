import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

@Controller('health')
class HealthController {
  @Get()
  getHealth(): { status: 'ok'; service: 'rovere-api'; check: 'liveness' } {
    return { status: 'ok', service: 'rovere-api', check: 'liveness' };
  }
}

@Module({ controllers: [HealthController] })
class AppModule {}

export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  return app;
}
