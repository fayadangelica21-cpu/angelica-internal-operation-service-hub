import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentUser, CurrentUserData } from '../requests/current-user';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { UserEntity } from './user.entity';

@Controller('auth')
@UseGuards(FirebaseAuthGuard)
export class AuthController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  @Get('me')
  async me(@CurrentUser() user: CurrentUserData): Promise<CurrentUserData> {
    await this.usersRepository.upsert({
      id: user.id,
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      role: user.role,
      departmentId: user.departmentId ?? null,
    }, ['id']);
    return user;
  }
}
