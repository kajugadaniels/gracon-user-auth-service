import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// PrismaService wraps PrismaClient and integrates with NestJS lifecycle
// OnModuleInit  → connects to DB when the app starts
// OnModuleDestroy → disconnects cleanly when the app shuts down
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // Prisma 7 requires a driver adapter — datasource url in schema.prisma is no longer supported.
    // DATABASE_URL is validated by ConfigModule at startup, so this guard is a safety net only.
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
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
