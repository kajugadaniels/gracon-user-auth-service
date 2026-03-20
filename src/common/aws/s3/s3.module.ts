import { Global, Module } from '@nestjs/common';
import { S3Service } from './s3.service';

// @Global — S3Service available everywhere without re-importing
@Global()
@Module({
  providers: [S3Service],
  exports: [S3Service],
})
export class S3Module {}
