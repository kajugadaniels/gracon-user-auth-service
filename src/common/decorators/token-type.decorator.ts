import { SetMetadata } from '@nestjs/common';

// Metadata key used by TokenTypeGuard to read the required token type
export const TOKEN_TYPE_KEY = 'tokenType';

/**
 * Declares which token type a route accepts.
 *
 * Usage:
 *   @RequireTokenType('full')    — dashboard, profile, etc.
 *   @RequireTokenType('any')     — verify-identity (limited or full both work)
 *
 * If this decorator is not applied, JwtAuthGuard defaults to requiring 'full'.
 */
export const RequireTokenType = (type: 'full' | 'any') =>
  SetMetadata(TOKEN_TYPE_KEY, type);
