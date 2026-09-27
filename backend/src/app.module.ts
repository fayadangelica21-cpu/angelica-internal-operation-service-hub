import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestEntity } from './requests/entities/request.entity';
import { RequestStatusHistoryEntity } from './requests/entities/request-status-history.entity';
import { UserEntity } from './auth/user.entity';
import { RequestsModule } from './requests/requests.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: process.env.DATABASE_PATH || 'data/service-hub.sqlite',
      entities: [RequestEntity, RequestStatusHistoryEntity, UserEntity],
      // Local SQLite slice only. Do not use synchronize against a shared database.
      synchronize: true,
    }),
    RequestsModule,
  ],
})
export class AppModule {}
