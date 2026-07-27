import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChallengeStatus, Prisma } from '@prisma/client';
import * as crypto from 'crypto';

/**
 * Kolom yang aman ditampilkan ke publik.
 * Sengaja memakai daftar putih, bukan mengecualikan kolom: setiap kolom baru
 * di CompanyProfile harus lolos peninjauan sebelum ikut terekspos.
 * Yang TIDAK boleh ikut: inviteCode (kunci gabung tim), userId (ID akun PIC),
 * dan kybStatus (status internal verifikasi bisnis).
 */
const PUBLIC_COMPANY_SELECT = {
  id: true,
  slug: true,
  companyName: true,
  logoUrl: true,
  description: true,
  websiteUrl: true,
  industry: true,
  companySize: true,
  location: true,
  linkedinUrl: true,
  trustScore: true,
  subscriptionTier: true,
  createdAt: true,
} satisfies Prisma.CompanyProfileSelect;

const INVITE_CODE_TTL_HOURS = 48;

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.companyProfile.findMany({
      select: {
        ...PUBLIC_COMPANY_SELECT,
        _count: {
          select: { challenges: true },
        },
      },
      orderBy: { trustScore: 'desc' },
    });
  }

  async findOne(idOrSlug: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);

    const company = await this.prisma.companyProfile.findFirst({
      where: isUuid ? { id: idOrSlug } : { slug: idOrSlug },
      select: {
        ...PUBLIC_COMPANY_SELECT,
        challenges: {
          where: { isPrivate: false },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const now = new Date();

    const upcoming: any[] = [];
    const ongoing: any[] = [];
    const completed: any[] = [];

    for (const challenge of company.challenges) {
      if (challenge.status === ChallengeStatus.CLOSED) {
        completed.push(challenge);
        continue;
      }

      if (challenge.deadlineAt && challenge.deadlineAt <= now) {
        completed.push(challenge);
        continue;
      }

      if (challenge.startsAt && challenge.startsAt > now) {
        upcoming.push(challenge);
        continue;
      }

      // If it's published, and not closed, not past deadline, and not in the future, it's ongoing
      if (challenge.status === ChallengeStatus.PUBLISHED) {
        ongoing.push(challenge);
      }
    }

    // Remove the raw challenges array and return the grouped ones
    const { challenges, ...companyData } = company;

    return {
      ...companyData,
      challenges: {
        upcoming,
        ongoing,
        completed,
      },
    };
  }

  // --- Team Management & Audit Trail ---

  async generateInviteCode(companyId: string) {
    // Math.random() adalah PRNG non-kriptografis dan bisa diprediksi. Kode ini
    // memberi akses penuh ke ruang kerja perusahaan, jadi wajib dari CSPRNG.
    const inviteCode = crypto.randomBytes(16).toString('base64url').toUpperCase();
    const inviteCodeExpiresAt = new Date(
      Date.now() + INVITE_CODE_TTL_HOURS * 60 * 60 * 1000,
    );

    const updated = await this.prisma.companyProfile.update({
      where: { id: companyId },
      data: { inviteCode, inviteCodeExpiresAt },
      select: { id: true, inviteCode: true, inviteCodeExpiresAt: true },
    });

    return updated;
  }

  async getTeamMembers(companyId: string) {
    return this.prisma.companyMember.findMany({
      where: { companyId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            companyProfile: { select: { companyName: true, logoUrl: true } },
            talentProfile: { select: { fullName: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async getActivityLogs(companyId: string) {
    return this.prisma.companyActivityLog.findMany({
      where: { companyId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            companyProfile: { select: { companyName: true, logoUrl: true } },
            talentProfile: { select: { fullName: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100, // limit for performance
    });
  }

  async logAction(
    companyId: string,
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    details?: any,
  ) {
    return this.prisma.companyActivityLog.create({
      data: {
        companyId,
        userId,
        action,
        entityType,
        entityId,
        details: details ? JSON.parse(JSON.stringify(details)) : null,
      },
    });
  }
}
