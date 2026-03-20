import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    // Register Passport with JWT as the default strategy
    PassportModule.register({ defaultStrategy: 'jwt' }),

    // Configure JWT module — secret pulled from .env at runtime
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '15m', // access token TTL
          issuer: 'id-verification-gateway', // identifies token source
          audience: 'id-verification-client', // identifies intended recipient
        },
      }),
    }),

    UsersModule, // provides UsersService for findByEmail and findById
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy, // registered with Passport automatically
  ],
  exports: [AuthService, JwtStrategy, PassportModule],
})
export class AuthModule {}
