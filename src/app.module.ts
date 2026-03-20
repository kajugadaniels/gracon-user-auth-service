import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { EncryptionModule } from './common/crypto/encryption.module';
import { PidModule } from './common/pid/pid.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { CitizenModule } from './modules/citizen/citizen.module';
import { AppMailerModule } from './common/mailer/mailer.module';
import { S3Module } from './common/aws/s3/s3.module';

@Module({
  imports: [
    // Load .env globally — available in every module via ConfigService
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Global modules — injectable everywhere without re-importing
    PrismaModule, // database access via Prisma
    EncryptionModule, // AES-256 encryption + SHA-256 hashing
    PidModule, // platform ID generation
    AppMailerModule, // email sending service
    S3Module, // AWS S3 file handling

    // Feature modules
    UsersModule,
    AuthModule,
    CitizenModule,
  ],
})
export class AppModule {}
