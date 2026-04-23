/**
 * Foreign identity integration module.
 * This isolates the service-to-service FIN lookup dependency so the rest
 * of auth only depends on a small provider contract.
 */
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ForeignIdentityClient } from './foreign-identity.client';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (_config: ConfigService) => ({
        timeout: 12_000,
        maxRedirects: 0,
      }),
    }),
  ],
  providers: [ForeignIdentityClient],
  exports: [ForeignIdentityClient],
})
export class ForeignIdentityModule {}
