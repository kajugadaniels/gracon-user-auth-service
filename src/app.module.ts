import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './common/prisma/prisma.module';
import { EncryptionModule } from './common/crypto/encryption.module';
import { PidModule } from './common/pid/pid.module';
import { AppMailerModule } from './common/mailer/mailer.module';
import { S3Module } from './common/aws/s3/s3.module';
import { TasksModule } from './common/tasks/tasks.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { CitizenModule } from './modules/citizen/citizen.module';
import { VerificationModule } from './modules/verification/verification.module';
import { CustomThrottlerGuard } from './common/guards/throttler.guard';

@Module({
  imports: [
    // Load .env globally across all modules
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate limiting — three named throttlers with different limits.
    // Applied globally via APP_GUARD below.
    // Individual routes override with @ThrottleAuth(), @ThrottleStrict(), etc.
    ThrottlerModule.forRoot([
      {
        // Default limit — applied to all routes not using a named decorator
        name: 'general',
        ttl: 60_000, // 1 minute window
        limit: 60, // 60 requests per window per IP
      },
      {
        // For authentication endpoints — login, register, forgot password
        name: 'auth',
        ttl: 60_000, // 1 minute window
        limit: 5, // 5 attempts per window per IP
      },
      {
        // For high-security endpoints — verification submit, change password
        name: 'strict',
        ttl: 600_000, // 10 minute window
        limit: 3, // 3 attempts per window per IP
      },
    ]),

    // Global common modules — injectable everywhere
    PrismaModule,
    EncryptionModule,
    PidModule,
    AppMailerModule,
    S3Module,
    TasksModule,

    // Feature modules
    UsersModule,
    AuthModule,
    CitizenModule,
    VerificationModule,
  ],
  providers: [
    // Apply CustomThrottlerGuard globally — every route is rate-limited
    // unless decorated with @SkipThrottle()
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule {}
