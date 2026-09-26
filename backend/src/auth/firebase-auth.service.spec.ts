jest.mock('firebase-admin/app', () => ({
  applicationDefault: jest.fn(() => ({})),
  getApp: jest.fn(() => ({})),
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(() => ({})),
}));
jest.mock('firebase-admin/auth', () => ({ getAuth: jest.fn() }));

import { FirebaseAuthService } from './firebase-auth.service';
import { UserRole } from '../requests/current-user';

type RoleAssignment = { role: UserRole; departmentId?: string };
type RoleResolver = { resolveRole: (uid: string) => RoleAssignment };

describe('Firebase UID role assignments', () => {
  const originalAssignments = process.env.FIREBASE_ROLE_ASSIGNMENTS;
  let service: FirebaseAuthService;
  let resolveRole: (uid: string) => RoleAssignment;

  beforeAll(() => {
    process.env.FIREBASE_ROLE_ASSIGNMENTS = JSON.stringify({
      H66AOVQgBBV8bEXcNSt6r1XgXQ63: { role: 'Admin' },
      Thww4kTkusWzwTEGmOVdgwv5eK73: { role: 'Staff', departmentId: 'DEPT-IT' },
      G3SzUUs3wcQa3H2kasU8JqcrP8w2: { role: 'Staff', departmentId: 'DEPT-HR' },
      bN0iOJrjXVNgXVMaMwLsAvMAyy23: { role: 'Staff', departmentId: 'DEPT-FINANCE' },
    });
    service = new FirebaseAuthService();
    resolveRole = (service as unknown as RoleResolver).resolveRole.bind(service);
  });

  afterAll(() => {
    if (originalAssignments === undefined) delete process.env.FIREBASE_ROLE_ASSIGNMENTS;
    else process.env.FIREBASE_ROLE_ASSIGNMENTS = originalAssignments;
  });

  it.each([
    ['H66AOVQgBBV8bEXcNSt6r1XgXQ63', 'Admin', undefined],
    ['Thww4kTkusWzwTEGmOVdgwv5eK73', 'Staff', 'DEPT-IT'],
    ['G3SzUUs3wcQa3H2kasU8JqcrP8w2', 'Staff', 'DEPT-HR'],
    ['bN0iOJrjXVNgXVMaMwLsAvMAyy23', 'Staff', 'DEPT-FINANCE'],
  ])('maps UID %s to its configured role and department', (uid, role, departmentId) => {
    expect(resolveRole(uid)).toEqual({ role, departmentId });
  });

  it('keeps any Firebase account without a privileged UID assignment as an Employee', () => {
    expect(resolveRole('new-employee-firebase-uid')).toEqual({ role: 'Employee' });
  });
});
