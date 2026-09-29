import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { getRelease, logger } from '../logging/log';
import { aiStatus } from './ai-status';

export type HealthBody = {
  status: 'ok' | 'degraded' | 'down';
  release: string;
  uptimeSec: number;
  checks: { database: 'ok' | 'fail'; triageModel: string };
};

@Injectable()
export class HealthService {
  private lastStatus: string | null = null;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  live() {
    return { status: 'ok', release: getRelease(), uptimeSec: Math.round(process.uptime()) };
  }

  async ready(): Promise<{ httpStatus: number; body: HealthBody }> {
    let database: 'ok' | 'fail' = 'ok';
    let errorCode: string | undefined;
    try {
      if (!this.dataSource.isInitialized) throw new Error('not_initialized');
      const queryWithTimeout = async (sql: string) => {
        let timer: NodeJS.Timeout | undefined;
        try {
          await Promise.race([
            this.dataSource.query(sql),
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'DB_TIMEOUT' })), 3000);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      };

      await queryWithTimeout('SELECT 1');
      // A reachable but empty database is not ready to serve requests. This project
      // currently initializes its schema with TypeORM synchronize, so check each
      // registered entity table instead of claiming migrations have run.
      for (const entity of this.dataSource.entityMetadatas) {
        await queryWithTimeout(`SELECT 1 FROM ${this.dataSource.driver.escape(entity.tableName)} LIMIT 0`);
      }
    } catch (err) {
      database = 'fail';
      const e = err as { code?: string; name?: string };
      errorCode = e.code ?? e.name; // never the message: DB errors can include user or host names
    }

    const triageModel = aiStatus.state();
    const status: HealthBody['status'] =
      database === 'fail' ? 'down' : triageModel === 'unavailable' ? 'degraded' : 'ok';

    if (status !== this.lastStatus) {
      const level = status === 'ok' ? 'info' : status === 'degraded' ? 'warn' : 'error';
      logger[level]('health.check', {
        status,
        database,
        triageModel,
        errorCode,
        aiFailureReason: triageModel === 'unavailable' ? aiStatus.lastReason() : undefined,
      });
      this.lastStatus = status;
    }

    return {
      httpStatus: status === 'down' ? 503 : 200,
      body: { status, release: getRelease(), uptimeSec: Math.round(process.uptime()), checks: { database, triageModel } },
    };
  }
}
