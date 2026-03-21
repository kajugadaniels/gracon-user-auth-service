import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { VerificationService } from './verification.service';
import { VerificationController } from './verification.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        timeout: 50_000,
        maxRedirects: 0,
      }),
    }),
    AuthModule, // provides AuthService for token upgrade
  ],
  controllers: [VerificationController],
  providers: [VerificationService],
})
export class VerificationModule {}
