import { Global, Module } from '@nestjs/common';
import { SecurityEventService } from './security-event.service';

// @Global — SecurityEventService injectable everywhere without re-importing
@Global()
@Module({
  providers: [SecurityEventService],
  exports: [SecurityEventService],
})
export class SecurityEventModule {}
