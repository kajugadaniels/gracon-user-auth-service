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
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  /**
   * Called after Passport verifies the JWT signature.
   * Re-fetches the user from DB to catch deactivated accounts.
   * Returns an object that becomes req.user — read by @CurrentUser()
   * and by JwtAuthGuard.handleRequest() for token type enforcement.
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

    if (!user) {
      throw new UnauthorizedException('Account not found.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException(
        'Your account has been deactivated. Please contact support.',
      );
    }

    // Return userId, email, and tokenType — all three are used by guards
    // and decorators downstream
    return {
      userId: user.id,
      email: user.email,
      tokenType: payload.tokenType ?? 'full', // default to full for legacy tokens
    };
  }
}
