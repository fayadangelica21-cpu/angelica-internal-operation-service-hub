export const API_URL = import.meta.env.VITE_API_URL ?? '';

/** Local identity adapter for this slice. The backend still authorizes every action. */
export const identityHeaders = {
  'Content-Type': 'application/json',
  'x-user-id': import.meta.env.VITE_USER_ID ?? 'EMP-001',
  'x-user-role': import.meta.env.VITE_USER_ROLE ?? 'Employee',
};
