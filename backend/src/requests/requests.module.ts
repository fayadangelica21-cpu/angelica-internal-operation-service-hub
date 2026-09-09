import { Module } from '@nestjs/common';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { RequestStateMachineService } from './request-state-machine.service';

@Module({
  controllers: [RequestsController],
  providers: [RequestsService, RequestStateMachineService],
  exports: [RequestsService, RequestStateMachineService],
})
export class RequestsModule {}
