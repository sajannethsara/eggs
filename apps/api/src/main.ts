import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { ZodExceptionFilter } from './common/zod.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(','),
    credentials: true,
  });
  app.useGlobalFilters(new ZodExceptionFilter());
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on http://localhost:${port}/api`);
}

void bootstrap();
