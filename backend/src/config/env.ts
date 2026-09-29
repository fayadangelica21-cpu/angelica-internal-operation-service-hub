/**
 * Startup configuration check. Returns a list of problems that name VARIABLES only,
 * never their values, so it is safe to print.
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];
  const isProd = env.NODE_ENV === 'production';

  if (env.PORT && !/^\d+$/.test(env.PORT)) problems.push('PORT must be a number.');

  if (env.DATABASE_URL && !/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) {
    problems.push('DATABASE_URL must start with postgres:// or postgresql://.');
  }
  if (env.DB_SYNCHRONIZE && !['true', 'false'].includes(env.DB_SYNCHRONIZE)) {
    problems.push('DB_SYNCHRONIZE must be "true" or "false".');
  }
  if (!!env.AI_BASE_URL !== !!env.AI_API_KEY) {
    problems.push('AI_BASE_URL and AI_API_KEY must be set together (or both left empty for fallback mode).');
  }
  if (env.FIREBASE_ROLE_ASSIGNMENTS) {
    try {
      JSON.parse(env.FIREBASE_ROLE_ASSIGNMENTS);
    } catch {
      problems.push('FIREBASE_ROLE_ASSIGNMENTS is not valid JSON.');
    }
  }
  if (isProd) {
    if (!env.DATABASE_URL) problems.push('DATABASE_URL is required in production (SQLite is not persistent on the host).');
    if (!env.CORS_ORIGINS) problems.push('CORS_ORIGINS is required in production.');
    else if (parseCorsOrigins(env).length === 0) problems.push('CORS_ORIGINS must contain at least one origin.');
    if (!env.FIREBASE_PROJECT_ID) problems.push('FIREBASE_PROJECT_ID is required in production.');
    if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) problems.push('FIREBASE_SERVICE_ACCOUNT_JSON is required in production for Firebase ID-token verification.');
    if (!env.FIREBASE_ROLE_ASSIGNMENTS) problems.push('FIREBASE_ROLE_ASSIGNMENTS is required in production.');
  }
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as Record<string, unknown>;
      if (!account.project_id || !account.client_email || !account.private_key) {
        problems.push('FIREBASE_SERVICE_ACCOUNT_JSON must contain project_id, client_email, and private_key.');
      } else if (env.FIREBASE_PROJECT_ID && account.project_id !== env.FIREBASE_PROJECT_ID) {
        problems.push('FIREBASE_SERVICE_ACCOUNT_JSON project_id must match FIREBASE_PROJECT_ID.');
      }
    } catch {
      problems.push('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
    }
  }
  return problems;
}

export function parseCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
}
