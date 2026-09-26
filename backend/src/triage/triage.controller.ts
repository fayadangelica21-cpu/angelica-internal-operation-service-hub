import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, CurrentUserData } from '../requests/current-user';
import { TriageAiResponseDto, TriageRequestDto } from './triage.dto';
import { TriageService } from './triage.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

@Controller()
@UseGuards(FirebaseAuthGuard)
export class TriageController {
  constructor(private readonly triageService: TriageService) {}

  @Post('triage')
  @HttpCode(HttpStatus.CREATED)
  triage(@CurrentUser() user: CurrentUserData, @Body() dto: TriageRequestDto): Promise<TriageAiResponseDto> {
    return this.triageService.createTriage(user, dto);
  }
}
