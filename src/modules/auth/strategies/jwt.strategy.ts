import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { JwtPayload } from '../interfaces/auth.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      // Extract JWT from Authorization: Bearer <token> header
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      // Reject expired tokens — never allow expired JWTs
      ignoreExpiration: false,

      // Secret must match what was used to sign the token
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  /**
   * Called automatically by Passport after the JWT signature is verified.
   * We re-fetch the user from DB on every request to catch:
   * - Deactivated accounts
   * - Users whose verification status changed
   * - Deleted users
   *
   * The returned value is attached to req.user
   */
  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        isVerified: true,
        isActive: true,
        isIdVerified: true,
      },
    });

    // User deleted after token was issued
    if (!user) {
      throw new UnauthorizedException('Account not found');
    }

    // Account deactivated after token was issued
    if (!user.isActive) {
      throw new UnauthorizedException(
        'Your account has been deactivated. Please contact support.',
      );
    }

    // Return object is attached to req.user — used by @CurrentUser() decorator
    return { userId: user.id, email: user.email };
  }
}
