import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';

/** Public on purpose (no auth guard): the bodies contain no secrets or personal data. */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness: the process is up. Never touches the database. Used by Render's health check. */
  @Get('live')
  live() {
    return this.health.live();
  }

  /** Readiness: database reachable, plus the triage model state. 503 when the database is down. */
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const { httpStatus, body } = await this.health.ready();
    res.status(httpStatus);
    return body;
  }
}
