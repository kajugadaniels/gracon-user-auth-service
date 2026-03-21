// Convenience decorators for applying named throttler configurations.
// Named throttlers allow different limits per route — for example,
// login is stricter (5 attempts/min) than a general API call (60/min).
// Usage: @ThrottleAuth() on login/register/reset endpoints
//        @ThrottleStrict() on verification and password change
//        @ThrottleGeneral() to explicitly reset to the relaxed default
import { Throttle, SkipThrottle } from '@nestjs/throttler';

/**
 * Strict limit for authentication endpoints.
 * 5 requests per minute per IP.
 * Applies to: login, register, forgot-password, reset-password.
 */
export const ThrottleAuth = () => Throttle({ auth: { limit: 5, ttl: 60_000 } });

/**
 * Very strict limit for verification and password change.
 * 3 requests per 10 minutes per IP.
 * Applies to: verification submit, change-password.
 */
export const ThrottleStrict = () =>
  Throttle({ strict: { limit: 3, ttl: 600_000 } });

/**
 * Standard limit for general API endpoints.
 * 60 requests per minute per IP.
 * This is the global default — use this decorator only to
 * explicitly override a stricter limit on a parent controller.
 */
export const ThrottleGeneral = () =>
  Throttle({ general: { limit: 60, ttl: 60_000 } });

/**
 * Skips throttling entirely.
 * Use only for health checks and internal-only endpoints.
 */
export { SkipThrottle };
