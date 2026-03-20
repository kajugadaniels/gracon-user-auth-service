import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { VerificationService } from './verification.service';
import { VerificationController } from './verification.controller';

@Module({
  imports: [
    // HttpService for calling the FastAPI engine
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      useFactory: (config: ConfigService) => ({
        timeout: 50_000, // 50s outer timeout — engine has 45s internal
        maxRedirects: 0, // never follow redirects for internal service calls
      }),
    }),
  ],
  controllers: [VerificationController],
  providers: [VerificationService],
})
export class VerificationModule {}
