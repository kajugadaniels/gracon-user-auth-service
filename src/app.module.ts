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
import { DocsAuthMiddleware } from './common/security/docs-auth.middleware';
import { SecurityEventModule } from './common/security';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    ThrottlerModule.forRoot([
      { name: 'general', ttl: 60_000, limit: 60 },
      { name: 'auth', ttl: 60_000, limit: 5 },
      { name: 'strict', ttl: 600_000, limit: 3 },
    ]),

    PrismaModule,
    EncryptionModule,
    PidModule,
    AppMailerModule,
    S3Module,
    TasksModule,
    SecurityEventModule,
    UsersModule,
    AuthModule,
    CitizenModule,
    VerificationModule,
  ],
  providers: [
    // Global rate limiting guard
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
    // Docs middleware registered here so NestJS can inject ConfigService
    DocsAuthMiddleware,
  ],
})
export class AppModule {}
