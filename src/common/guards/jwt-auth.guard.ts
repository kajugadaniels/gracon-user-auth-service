import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { TOKEN_TYPE_KEY } from '../decorators/token-type.decorator';

/**
 * JWT Authentication Guard.
 *
 * Does two things:
 * 1. Validates the JWT signature and expiry (Passport handles this)
 * 2. Enforces token type — routes decorated with @RequireTokenType('any')
 *    accept both limited and full tokens. All other routes require 'full'.
 *
 * Token types:
 *   full    — issued after complete login (email + ID verified)
 *   limited — issued after email verification only, before ID verification
 *             Only allowed on /verification/* routes
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(
    err: unknown,
    user: Express.User | false,
    info: unknown,
    context: ExecutionContext,
  ) {
    // Passport validation failed — token missing, expired, or invalid
    if (err || !user) {
      throw new UnauthorizedException(
        'Authentication required. Please log in to continue.',
      );
    }

    // Read required token type from route metadata
    // Falls back to 'full' if decorator not present
    const requiredType =
      this.reflector.getAllAndOverride<'full' | 'any'>(TOKEN_TYPE_KEY, [
      [context.getHandler(), context.getClass()],
    ) ?? 'full';

    // All routes accept 'full' tokens — only check if route requires 'any'
    if (requiredType === 'any') {
      return user;
    }

    // Route requires 'full' — reject limited tokens
    const payload = user as { tokenType?: string };

    if (payload.tokenType === 'limited') {
      throw new ForbiddenException(
        'Please complete your identity verification before accessing this feature.',
      );
    }

    return user;
  }
}
