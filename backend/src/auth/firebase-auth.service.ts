import { ForbiddenException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { applicationDefault, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { CurrentUserData, UserRole } from '../requests/current-user';

type RoleAssignment = { role: UserRole; departmentId?: string };

@Injectable()
export class FirebaseAuthService {
  private readonly firebaseApp = getApps().length
    ? getApp()
    : initializeApp({
        credential: applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID || 'internaloperationservice-f9727',
      });

  async authenticateToken(idToken: string): Promise<CurrentUserData> {
    try {
      const claims = await getAuth(this.firebaseApp).verifyIdToken(idToken);
      const roleAssignment = this.resolveRole(claims.uid);
      if (roleAssignment.role === 'Staff' && !roleAssignment.departmentId) {
        throw new ForbiddenException('Staff account has no assigned department.');
      }
      return {
        id: claims.uid,
        email: typeof claims.email === 'string' ? claims.email : undefined,
        displayName: typeof claims.name === 'string' ? claims.name : undefined,
        role: roleAssignment.role,
        departmentId: roleAssignment.departmentId,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException || error instanceof InternalServerErrorException) throw error;
      throw new UnauthorizedException('Firebase ID token is invalid or expired.');
    }
  }

  private resolveRole(uid: string): RoleAssignment {
    const raw = process.env.FIREBASE_ROLE_ASSIGNMENTS;
    if (raw) {
      let assignments: Record<string, RoleAssignment>;
      try {
        assignments = JSON.parse(raw) as Record<string, RoleAssignment>;
      } catch {
        throw new InternalServerErrorException('Firebase role assignments are not valid JSON.');
      }
      const assignment = assignments[uid];
      if (assignment) {
        if (!['Employee', 'Staff', 'Admin'].includes(assignment.role)) {
          throw new ForbiddenException('Firebase account has an invalid role assignment.');
        }
        return { role: assignment.role, departmentId: assignment.departmentId };
      }
    }

    // Public Firebase signup is employee-only. Staff and Admin identities must be
    // explicitly assigned by the server operator in FIREBASE_ROLE_ASSIGNMENTS.
    return { role: 'Employee' };
  }
}
