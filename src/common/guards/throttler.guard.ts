// Custom throttler guard that returns a clean JSON response
// instead of NestJS's default plain-text "Too Many Requests" message.
// Also extracts the real client IP from x-forwarded-for headers
// so rate limiting works correctly behind proxies and load balancers.
import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { Request } from 'express';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  /**
   * Extracts the real client IP address.
   * Checks x-forwarded-for first (set by proxies/load balancers),
   * then falls back to the direct socket address.
   * Without this, all requests behind a proxy look like they come
   * from the same IP and would be rate-limited together.
   */
  protected async getTracker(req: Request): Promise<string> {
    const forwarded = req.headers['x-forwarded-for'];

    if (forwarded) {
      // x-forwarded-for can be a comma-separated list — take the first (original client)
      const ips = Array.isArray(forwarded)
        ? forwarded[0]
        : forwarded.split(',')[0];
      return ips.trim();
    }

    return req.socket.remoteAddress ?? 'unknown';
  }

  /**
   * Throws a structured JSON exception instead of the default plain-text one.
   * This ensures the frontend receives a consistent error shape it can handle.
   */
  protected throwThrottlingException(): Promise<void> {
    throw new ThrottlerException(
      JSON.stringify({
        statusCode: 429,
        error:      'Too Many Requests',
        message:    'You have made too many requests. Please wait before trying again.',
      }),
    );
  }
}
