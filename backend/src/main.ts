import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { parseCorsOrigins, validateEnv } from './config/env';
import { AppLogger } from './logging/app-logger';
import { getRelease, logger } from './logging/log';
import { requestLogger } from './logging/request-logger';

async function bootstrap() {
  const problems = validateEnv();
  if (problems.length > 0) {
    logger.error('config.invalid', { problems });
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { logger: new AppLogger() });
  app.use(requestLogger);
  app.enableCors({ origin: parseCorsOrigins() });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();

  const port = Number(process.env.PORT || 3001);
  await app.listen(port);

  logger.info('app.started', {
    port,
    release: getRelease(),
    database: process.env.DATABASE_URL ? 'postgres' : 'sqlite',
    triageMode: process.env.AI_BASE_URL && process.env.AI_API_KEY ? 'live-provider' : 'fallback',
    aiModel: process.env.AI_BASE_URL && process.env.AI_API_KEY ? process.env.AI_MODEL || 'default' : undefined,
  });
}
bootstrap();
