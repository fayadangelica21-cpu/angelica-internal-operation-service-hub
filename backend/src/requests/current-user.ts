import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';

export type UserRole = 'Employee' | 'Staff' | 'Admin';

export interface CurrentUserData {
  id: string;
  role: UserRole;
  departmentId?: string;
}

/**
 * Week 3 development identity adapter.
 * The official architecture says identity is supplied by an external company IdP.
 * This slice does not implement SSO; tests and local development provide the already-known
 * identity context through headers. Authorization is still enforced by the backend.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserData => {
    const request = ctx.switchToHttp().getRequest();
    const id = request.header('x-user-id');
    const role = request.header('x-user-role') as UserRole;
    const departmentId = request.header('x-user-department-id') || undefined;

    if (!id || !role || !['Employee', 'Staff', 'Admin'].includes(role)) {
      throw new ForbiddenException('A valid identity context is required.');
    }
    if (role === 'Staff' && !departmentId) {
      throw new ForbiddenException('Staff identity must include x-user-department-id.');
    }
    return { id, role, departmentId };
  },
);
