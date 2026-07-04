import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpgradeSubscriptionDto } from './dto/upgrade-subscription.dto';

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async upgrade(companyId: string, dto: UpgradeSubscriptionDto) {
    const company = await this.prisma.companyProfile.findUnique({
      where: { id: companyId },
      include: { user: true },
    });

    if (!company) {
      throw new NotFoundException('Profil Perusahaan tidak ditemukan');
    }

    const duration = dto.durationInMonths ?? 12;
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + duration);

    const updated = await this.prisma.companyProfile.update({
      where: { id: companyId },
      data: {
        subscriptionTier: dto.tier,
        subscriptionExpiresAt: expiresAt,
      },
    });

    await this.prisma.notification.create({
      data: {
        userId: company.userId,
        title: 'Peningkatan Paket Langganan Berhasil',
        content: `Selamat! Akun perusahaan Anda telah ditingkatkan ke paket ${dto.tier}. Masa berlaku hingga ${expiresAt.toLocaleDateString('id-ID')}. Akses fitur Q&A, AI Generator & Assessment premium kini aktif.`,
        linkUrl: '/company/billing',
      },
    });

    return {
      companyName: updated.companyName,
      subscriptionTier: updated.subscriptionTier,
      expiresAt: updated.subscriptionExpiresAt,
      message: `Berhasil beralih ke paket langganan ${dto.tier}.`,
    };
  }

  async getStatus(companyId: string) {
    const company = await this.prisma.companyProfile.findUnique({
      where: { id: companyId },
      select: {
        companyName: true,
        subscriptionTier: true,
        subscriptionExpiresAt: true,
        kybStatus: true,
      },
    });

    if (!company) {
      throw new NotFoundException('Profil Perusahaan tidak ditemukan');
    }

    return company;
  }
}
