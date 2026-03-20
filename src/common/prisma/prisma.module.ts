import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global() makes PrismaService available across the entire app
// without needing to import PrismaModule in every feature module
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService], // export so other modules can inject it
})
export class PrismaModule {}
