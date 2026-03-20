import { Global, Module } from '@nestjs/common';
import { PidService } from './pid.service';

@Global()
@Module({
  providers: [PidService],
  exports: [PidService],
})
export class PidModule {}
