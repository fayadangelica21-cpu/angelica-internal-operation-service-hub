import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AssignRequestDto } from './dto/assign-request.dto';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { RequestsService } from './requests.service';
import { CurrentUser, CurrentUserData } from './current-user';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

@Controller('requests')
@UseGuards(FirebaseAuthGuard)
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateRequestDto) {
    return this.requestsService.create(user, dto);
  }

  @Get('queue')
  getDepartmentQueue(@CurrentUser() user: CurrentUserData) {
    return this.requestsService.getDepartmentQueue(user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.requestsService.findOne(user, id);
  }

  @Patch(':id/assign')
  assign(@CurrentUser() user: CurrentUserData, @Param('id') id: string, @Body() dto: AssignRequestDto) {
    return this.requestsService.assign(user, id, dto);
  }

  @Patch(':id/status')
  updateStatus(@CurrentUser() user: CurrentUserData, @Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.requestsService.transitionStatus(user, id, dto);
  }
}
