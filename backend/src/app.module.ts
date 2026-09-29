import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDbOptions } from './config/database';
import { HealthModule } from './health/health.module';
import { RequestsModule } from './requests/requests.module';

@Module({
  imports: [
    // Options are built lazily (after dotenv). DATABASE_URL => Postgres, otherwise local SQLite.
    TypeOrmModule.forRootAsync({ useFactory: () => buildDbOptions() }),
    RequestsModule,
    HealthModule,
  ],
})
export class AppModule {}
