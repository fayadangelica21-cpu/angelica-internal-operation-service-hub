import { parseCorsOrigins, validateEnv } from './env';
import { buildDbOptions } from './database';

describe('config', () => {
  it('accepts an empty local environment', () => expect(validateEnv({})).toEqual([]));

  it('production requires database, CORS and role assignments, and names variables not values', () => {
    const problems = validateEnv({ NODE_ENV: 'production' } as never);
    expect(problems.join(' ')).toMatch(/DATABASE_URL.*CORS_ORIGINS.*FIREBASE_ROLE_ASSIGNMENTS/);
  });

  it('never echoes secret values in problems', () => {
    const problems = validateEnv({ DATABASE_URL: 'mysql://u:fake@localhost/db', AI_API_KEY: 'sk-secretvalue' } as never);
    expect(problems.join(' ')).not.toContain('fake');
    expect(problems.join(' ')).not.toContain('sk-secretvalue');
    expect(problems.length).toBe(2);
  });

  it('validates service-account JSON without echoing its private key', () => {
    const privateKey = 'very-secret-private-key';
    const invalid = validateEnv({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'project', private_key: privateKey }) } as never);
    expect(invalid.join(' ')).toContain('FIREBASE_SERVICE_ACCOUNT_JSON');
    expect(invalid.join(' ')).not.toContain(privateKey);
    expect(validateEnv({ FIREBASE_PROJECT_ID: 'project', FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'project', client_email: 'svc@example.test', private_key: privateKey }) } as never)).toEqual([]);
  });

  it('rejects blank production CORS origins', () => {
    const problems = validateEnv({ NODE_ENV: 'production', CORS_ORIGINS: ' , ' } as never);
    expect(problems).toContain('CORS_ORIGINS must contain at least one origin.');
  });
  it('parses CORS origins with a localhost default', () => {
    expect(parseCorsOrigins({})).toEqual(['http://localhost:5173']);
    expect(parseCorsOrigins({ CORS_ORIGINS: 'https://a.onrender.com/, https://b.com' } as never)).toEqual(['https://a.onrender.com', 'https://b.com']);
  });

  it('chooses Postgres when DATABASE_URL is set and SQLite otherwise', () => {
    expect(buildDbOptions({ DATABASE_URL: 'postgresql://u:fake@localhost/db' } as never)).toMatchObject({ type: 'postgres', synchronize: false });
    expect(buildDbOptions({ DATABASE_URL: 'postgresql://u:fake@localhost/db', DB_SYNCHRONIZE: 'true' } as never)).toMatchObject({ synchronize: true });
    expect(buildDbOptions({})).toMatchObject({ type: 'sqlite', synchronize: true });
  });
});
