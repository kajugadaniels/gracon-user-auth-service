import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';

// @Global() — EncryptionService will be available everywhere
// without re-importing this module in each feature module
@Global()
@Module({
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class EncryptionModule {}
