import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { UserEntity } from './auth/user.entity';
import { buildDbOptions } from './config/database';
import { logger } from './logging/log';

/**
 * Recreates the Staff/Admin profile rows from FIREBASE_ROLE_ASSIGNMENTS on an empty database,
 * so recovery on a fresh database is: (DB_SYNCHRONIZE=true) -> npm run db:seed -> redeploy.
 * Employees need no seeding: they register themselves on first sign-in.
 * Email/displayName are left empty and filled in when each person signs in.
 */
async function main() {
  const raw = process.env.FIREBASE_ROLE_ASSIGNMENTS;
  if (!raw) {
    logger.error('seed.failed', { reason: 'FIREBASE_ROLE_ASSIGNMENTS is not set' });
    process.exit(1);
  }
  const assignments = JSON.parse(raw) as Record<string, { role: 'Employee' | 'Staff' | 'Admin'; departmentId?: string }>;

  const ds = new DataSource(buildDbOptions() as DataSourceOptions);
  await ds.initialize();
  try {
    const repo = ds.getRepository(UserEntity);
    let created = 0;
    let existing = 0;
    for (const [uid, a] of Object.entries(assignments)) {
      if (await repo.findOneBy({ id: uid })) {
        existing++;
        continue;
      }
      await repo.save(repo.create({ id: uid, email: null, displayName: null, role: a.role, departmentId: a.departmentId ?? null }));
      created++;
    }
    logger.info('seed.completed', { created, existing });
  } finally {
    await ds.destroy();
  }
}

main().catch((err: { name?: string; code?: string }) => {
  logger.error('seed.failed', { errorName: err?.name, errorCode: err?.code });
  process.exit(1);
});
