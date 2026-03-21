import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    // Load .env globally across all modules
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

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
  // No global APP_GUARD here — guards are applied per-controller
  // so each route can declare its own token type requirement
})
export class AppModule {}
