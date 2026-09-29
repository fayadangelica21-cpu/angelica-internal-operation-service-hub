import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger, requestContext } from './log';

/**
 * Express middleware: assigns a request id, and logs one line per finished request.
 * Logs method, route pattern, status, duration and the caller's ROLE only (never identity, body or headers).
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Generate our own safe correlation id; client-provided values could contain personal data.
  const requestId = randomUUID();
  res.setHeader('x-request-id', requestId);
  const start = process.hrtime.bigint();

  requestContext.run({ requestId }, () => {
    res.on('finish', () => {
      const status = res.statusCode;
      const path = req.originalUrl.split('?')[0];
      // Health polls are frequent: only log them when they are not a plain 200.
      if (path.startsWith('/health/') && status === 200) return;

      const user = (req as unknown as { currentUser?: { role?: string; departmentId?: string } }).currentUser;
      const route = req.route?.path ? `${req.baseUrl || ''}${req.route.path}` : 'unmatched';
      const event =
        status === 401 || status === 403 ? 'auth.rejected' : status === 400 ? 'validation.rejected' : 'request.completed';
      const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

      logger[level](event, {
        requestId,
        method: req.method,
        route,
        status,
        durationMs: Math.round(Number(process.hrtime.bigint() - start) / 1e6),
        actorRole: user?.role,
        departmentId: user?.departmentId,
      });
    });
    next();
  });
}
