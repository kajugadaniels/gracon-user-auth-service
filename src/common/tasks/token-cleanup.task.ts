import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TokenCleanupTask {
  private readonly logger = new Logger(TokenCleanupTask.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs every day at 2am — deletes expired or revoked refresh tokens.
   * Keeps the refresh_tokens table lean.
   * Old tokens have zero security value once expired/revoked.
   */

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupExpiredTokens(): Promise<void> {
    try {
      const result = await this.prisma.refreshToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } }, // expired
            { revoked: true }, // revoked on logout
          ],
        },
      });

      if (result.count > 0) {
        this.logger.log(
          `Token cleanup: deleted ${result.count} expired/revoked tokens`,
        );
      }
    } catch (error) {
      this.logger.error('Token cleanup task failed', error);
    }
  }
}
