import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { Request } from 'express';
import { SecurityEventService } from '../security/security-event.service';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  constructor(
    // Inject SecurityEventService for logging rate limit hits
    private readonly secEvent: SecurityEventService,
    ...args: ConstructorParameters<typeof ThrottlerGuard>
  ) {
    super(...args);
  }

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

  protected throwThrottlingException(context: ExecutionContext): Promise<void> {
    // Log the rate limit hit — fire-and-forget
    const req = context.switchToHttp().getRequest<Request>();
    const ip = req.socket.remoteAddress ?? 'unknown';

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
