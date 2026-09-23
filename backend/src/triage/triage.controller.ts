import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CurrentUser, CurrentUserData } from '../requests/current-user';
import { TriageAiResponseDto, TriageRequestDto } from './triage.dto';
import { TriageService } from './triage.service';

@Controller()
export class TriageController {
  constructor(private readonly triageService: TriageService) {}

  @Post('triage')
  @HttpCode(HttpStatus.CREATED)
  triage(@CurrentUser() user: CurrentUserData, @Body() dto: TriageRequestDto): Promise<TriageAiResponseDto> {
    return this.triageService.createTriage(user, dto);
  }
}
