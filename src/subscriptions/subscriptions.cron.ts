import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionTier } from '@prisma/client';

/**
 * Sebelumnya subscriptionExpiresAt hanya diisi saat pembayaran berhasil, tapi
 * tidak ada yang pernah membacanya kembali. Akibatnya perusahaan tetap
 * menikmati tier premium selamanya setelah sekali membayar.
 */
@Injectable()
export class SubscriptionsCronService {
  private readonly logger = new Logger(SubscriptionsCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async downgradeExpiredSubscriptions() {
    try {
      const now = new Date();

      const result = await this.prisma.companyProfile.updateMany({
        where: {
          subscriptionExpiresAt: { lt: now },
          subscriptionTier: { not: SubscriptionTier.STARTUP },
        },
        data: {
          subscriptionTier: SubscriptionTier.STARTUP,
          subscriptionExpiresAt: null,
        },
      });

      if (result.count > 0) {
        this.logger.log(
          `${result.count} langganan perusahaan kedaluwarsa, diturunkan ke tier STARTUP.`,
        );
      }
    } catch (error) {
      this.logger.error('Gagal memproses penurunan tier langganan:', error);
    }
  }
}
