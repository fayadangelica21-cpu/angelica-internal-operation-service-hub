import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

export type UserRole = 'Employee' | 'Staff' | 'Admin';

export interface CurrentUserData {
  id: string;
  role: UserRole;
  email?: string;
  displayName?: string;
  departmentId?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserData => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.currentUser as CurrentUserData | undefined;
    if (!user) throw new UnauthorizedException('A verified Firebase identity is required.');
    return user;
  },
);
