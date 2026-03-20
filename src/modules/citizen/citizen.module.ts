import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CitizenService } from './citizen.service';

@Module({
  imports: [
    // HttpModule powers the Axios HTTP client used in CitizenService
    // Configured with a base timeout as a safety net
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      useFactory: (config: ConfigService) => ({
        timeout: 12_000, // 12s outer timeout (service has its own 10s)
        maxRedirects: 3, // follow up to 3 redirects
        validateStatus: () => true, // let our service handle all HTTP status codes
      }),
    }),

    // In-memory cache for NID lookups
    // Prevents repeated calls to the external API for the same NID
    // TTL and storage managed inside CitizenService
    CacheModule.register({
      ttl: 300, // 5 minutes default TTL in seconds
      max: 500, // max 500 cached entries — protects memory usage
    }),
  ],
  providers: [CitizenService],
  exports: [CitizenService], // exported so UsersModule can inject it
})
export class CitizenModule {}
