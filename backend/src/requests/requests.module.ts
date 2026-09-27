import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestEntity } from './entities/request.entity';
import { RequestStatusHistoryEntity } from './entities/request-status-history.entity';
import { RequestStateMachineService } from './request-state-machine.service';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { TriageController } from '../triage/triage.controller';
import { TriageProviderService } from '../triage/triage-provider.service';
import { TriageService } from '../triage/triage.service';
import { AuthModule } from '../auth/auth.module';
import { UserEntity } from '../auth/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RequestEntity, RequestStatusHistoryEntity, UserEntity]), AuthModule],
  controllers: [RequestsController, TriageController],
  providers: [RequestsService, RequestStateMachineService, TriageService, TriageProviderService],
  exports: [RequestsService, RequestStateMachineService, TriageService, TriageProviderService],
})
export class RequestsModule {}
