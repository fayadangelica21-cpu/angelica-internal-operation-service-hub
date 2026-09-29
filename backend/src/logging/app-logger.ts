import { LoggerService } from '@nestjs/common';
import { logger } from './log';

/** Routes Nest's own logger through the JSON logger. Startup chatter (route mapping etc.) is dropped. */
export class AppLogger implements LoggerService {
  log(message: unknown, context?: string) {
    if (context === 'NestApplication') logger.info('nest.started', { context });
  }
  error(message: unknown, ...rest: unknown[]) {
    // Framework errors and stacks can contain request data or provider/database details.
    // Keep only the error type and Nest context; never serialize the message or stack.
    const lastParameter = rest[rest.length - 1];
    const candidate = typeof lastParameter === 'string' ? lastParameter : undefined;
    const context = candidate && /^[A-Za-z0-9_.-]{1,80}$/.test(candidate) ? candidate : undefined;
    logger.error('nest.error', { errorType: message instanceof Error ? message.name : typeof message, context });
  }
  warn(message: unknown, context?: string) {
    logger.warn('nest.warn', { context: context && /^[A-Za-z0-9_.-]{1,80}$/.test(context) ? context : undefined });
  }
  debug() {}
  verbose() {}
}
