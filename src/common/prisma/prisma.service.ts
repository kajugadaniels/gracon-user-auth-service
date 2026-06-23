import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createPrismaClientOptions, PrismaClient } from '@gracon/database';

// PrismaService wraps PrismaClient and integrates with NestJS lifecycle
// OnModuleInit  → connects to DB when the app starts
// OnModuleDestroy → disconnects cleanly when the app shuts down
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super(createPrismaClientOptions());
  }

  async onModuleInit() {
    // Establish the database connection on startup
    await this.$connect();
  }

  async onModuleDestroy() {
    // Close the connection gracefully on shutdown
    // Prevents connection leaks in production
    await this.$disconnect();
  }
}
