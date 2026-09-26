import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestEntity } from './entities/request.entity';
import { RequestStateMachineService } from './request-state-machine.service';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { TriageController } from '../triage/triage.controller';
import { TriageProviderService } from '../triage/triage-provider.service';
import { TriageService } from '../triage/triage.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([RequestEntity]), AuthModule],
  controllers: [RequestsController, TriageController],
  providers: [RequestsService, RequestStateMachineService, TriageService, TriageProviderService],
  exports: [RequestsService, RequestStateMachineService, TriageService, TriageProviderService],
})
export class RequestsModule {}
