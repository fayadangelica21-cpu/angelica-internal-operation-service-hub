import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as dotenv from 'dotenv';
import { AppModule } from './app.module';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: 'http://localhost:5173' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const aiEnabled = !!process.env.AI_BASE_URL && !!process.env.AI_API_KEY;
  if (aiEnabled) {
    console.log(`AI triage: LIVE provider enabled (model ${process.env.AI_MODEL || 'default'})`);
  } else {
    console.log('AI triage: no provider configured — using deterministic fallback ...');
  }

  await app.listen(process.env.PORT || 3001);
}
bootstrap();
