import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { UserEntity } from '../auth/user.entity';
import { RequestStatusHistoryEntity } from '../requests/entities/request-status-history.entity';
import { RequestEntity } from '../requests/entities/request.entity';

export const ENTITIES = [RequestEntity, RequestStatusHistoryEntity, UserEntity];

/**
 * DATABASE_URL set  -> hosted Postgres (Neon). Schema is only created when DB_SYNCHRONIZE=true.
 * DATABASE_URL unset -> local SQLite file (development and tests), unchanged from before.
 * Read lazily so dotenv has already loaded.
 */
export function buildDbOptions(env: NodeJS.ProcessEnv = process.env): TypeOrmModuleOptions {
  if (env.DATABASE_URL) {
    return {
      type: 'postgres',
      url: env.DATABASE_URL,
      entities: ENTITIES,
      synchronize: env.DB_SYNCHRONIZE === 'true',
      ssl: env.DATABASE_SSL === 'false' ? false : true,
      extra: { max: 5, connectionTimeoutMillis: 5000 },
    };
  }
  return {
    type: 'sqlite',
    database: env.DATABASE_PATH || 'data/service-hub.sqlite',
    entities: ENTITIES,
    synchronize: env.DB_SYNCHRONIZE ? env.DB_SYNCHRONIZE === 'true' : true,
  };
}
