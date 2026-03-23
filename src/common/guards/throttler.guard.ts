import { Injectable, Inject, ExecutionContext } from '@nestjs/common';
import {
  ThrottlerGuard,
  ThrottlerException,
} from '@nestjs/throttler';
import type { ThrottlerLimitDetail } from '@nestjs/throttler/dist/throttler.guard.interface';
import { Request } from 'express';
import { SecurityEventService } from '../security/security-event.service';

/**
 * Global rate-limiting guard.
 *
 * Extends ThrottlerGuard without overriding the constructor — using property
 * injection for SecurityEventService instead. The constructor spread pattern
 * breaks emitDecoratorMetadata and causes NestJS DI to omit the throttler
 * options, leaving this.options undefined at onModuleInit.
 *
 * throwThrottlingException signature matches @nestjs/throttler v6.
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  // Property injection — safe because NestJS resolves properties after
  // the parent constructor has fully initialised the guard instance.
  @Inject(SecurityEventService)
  private readonly secEvent: SecurityEventService;

  /**
   * Extracts the real client IP, preferring X-Forwarded-For so that
   * rate limits apply per-client even behind a reverse proxy.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  protected async getTracker(req: Request): Promise<string> {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded)
        ? forwarded[0]
        : forwarded.split(',')[0];
      return ips.trim();
    }
    return req.socket.remoteAddress ?? 'unknown';
  }

  /**
   * Logs the rate-limit hit as a security event and throws a structured
   * 429 response. The second parameter is required by ThrottlerGuard v6.
   */
  protected throwThrottlingException(
    context: ExecutionContext,
    _detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const req = context.switchToHttp().getRequest<Request>();
    const ip = req.socket.remoteAddress ?? 'unknown';

    // Fire-and-forget — never block the response path
    void this.secEvent.logRateLimitExceeded({
      ipAddress: ip,
      metadata: {
        path: req.path,
        method: req.method,
      },
    });

    throw new ThrottlerException(
      JSON.stringify({
        statusCode: 429,
        error: 'Too Many Requests',
        message:
          'You have made too many requests. Please wait before trying again.',
      }),
    );
  }
}
