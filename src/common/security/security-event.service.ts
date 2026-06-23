// SecurityEventService — writes security events to the SecurityEventLog table.
// Called throughout the auth service whenever a security-relevant action occurs.
// The admin service reads this table to give admins real-time threat visibility.
//
// Design principle: this service never throws — a logging failure must never
// break the primary auth flow. All errors are caught and logged server-side.
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, SecurityEvent } from '@gracon/database';

interface LogEventParams {
  eventType: SecurityEvent;
  userId?: string; // null for pre-auth events (unknown email, rate limit)
  ipAddress?: string;
  metadata?: Record<string, unknown>; // any structured context
}

@Injectable()
export class SecurityEventService {
  private readonly logger = new Logger(SecurityEventService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Logs a security event to the database.
   * Never throws — failure is logged but does not affect the caller.
   * Called fire-and-forget in most cases (do not await unless you need
   * to guarantee the write before returning a response).
   */
  async log(params: LogEventParams): Promise<void> {
    try {
      await this.prisma.securityEventLog.create({
        data: {
          eventType: params.eventType,
          userId: params.userId ?? null,
          ipAddress: params.ipAddress ?? null,
          // Cast required: Record<string,unknown> is wider than Prisma's InputJsonValue.
          // Prisma.JsonNull is used instead of null for nullable JSON fields in Prisma 7.
          metadata:
            (params.metadata as Prisma.InputJsonValue | undefined) ??
            Prisma.JsonNull,
        },
      });
    } catch (error) {
      // Never throw — a log failure must not break the auth flow
      this.logger.error(
        `Failed to write security event [${params.eventType}] for user ${params.userId ?? 'unknown'}`,
        error,
      );
    }
  }

  // ── Convenience methods ───────────────────────────────────────
  // Each method is named after the event it logs, making call sites
  // self-documenting without needing to import the SecurityEvent enum.

  async logLoginFailed(
    params: Omit<LogEventParams, 'eventType'>,
  ): Promise<void> {
    return this.log({ ...params, eventType: SecurityEvent.LOGIN_FAILED });
  }

  async logLoginSuccess(
    params: Omit<LogEventParams, 'eventType'>,
  ): Promise<void> {
    return this.log({ ...params, eventType: SecurityEvent.LOGIN_SUCCESS });
  }

  async logVerificationFailed(
    params: Omit<LogEventParams, 'eventType'>,
  ): Promise<void> {
    return this.log({
      ...params,

      eventType: SecurityEvent.VERIFICATION_FAILED,
    });
  }

  async logVerificationPassed(
    params: Omit<LogEventParams, 'eventType'>,
  ): Promise<void> {
    return this.log({
      ...params,

      eventType: SecurityEvent.VERIFICATION_PASSED,
    });
  }

  async logPasswordResetRequested(
    params: Omit<LogEventParams, 'eventType'>,
  ): Promise<void> {
    return this.log({
      ...params,

      eventType: SecurityEvent.PASSWORD_RESET_REQUESTED,
    });
  }

  async logPasswordChanged(
    params: Omit<LogEventParams, 'eventType'>,
  ): Promise<void> {
    return this.log({ ...params, eventType: SecurityEvent.PASSWORD_CHANGED });
  }

  async logSessionsRevokedByUser(
    params: Omit<LogEventParams, 'eventType'>,
  ): Promise<void> {
    return this.log({
      ...params,

      eventType: SecurityEvent.SESSIONS_REVOKED_BY_USER,
    });
  }

  async logRevokedTokenReuse(
    params: Omit<LogEventParams, 'eventType'>,
  ): Promise<void> {
    return this.log({
      ...params,

      eventType: SecurityEvent.REVOKED_TOKEN_REUSE,
    });
  }

  async logRateLimitExceeded(
    params: Omit<LogEventParams, 'eventType'>,
  ): Promise<void> {
    return this.log({
      ...params,

      eventType: SecurityEvent.RATE_LIMIT_EXCEEDED,
    });
  }
}
