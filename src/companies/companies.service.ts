import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChallengeStatus, Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import {
  CHALLENGE_CATEGORY_SELECT,
  flattenCategory,
} from '../common/selects/challenge-category.select';

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
  createdAt: true,
} satisfies Prisma.CompanyProfileSelect;

/**
 * Kolom challenge yang aman tampil di profil publik perusahaan.
 * Sebelumnya seluruh baris ikut terkirim, termasuk `gradingRubric` dan
 * `aiPromptUsed` yang tidak ada urusannya dengan pengunjung.
 */
const PUBLIC_CHALLENGE_SELECT = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  category: CHALLENGE_CATEGORY_SELECT,
  difficulty: true,
  challengeType: true,
  status: true,
  rewardDescription: true,
  startsAt: true,
  deadlineAt: true,
  createdAt: true,
} satisfies Prisma.ChallengeSelect;

const INVITE_CODE_TTL_HOURS = 48;
const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    query: { page?: number; limit?: number; search?: string } = {},
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(query.limit) || DEFAULT_PAGE_SIZE),
    );

    const where: Prisma.CompanyProfileWhereInput = query.search
      ? {
          OR: [
            { companyName: { contains: query.search, mode: 'insensitive' } },
            { industry: { contains: query.search, mode: 'insensitive' } },
            { location: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.companyProfile.findMany({
        where,
        select: {
          ...PUBLIC_COMPANY_SELECT,
          _count: {
            select: { challenges: true },
          },
        },
        orderBy: { trustScore: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.companyProfile.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(idOrSlug: string) {
    // Tidak memakai tebakan berdasarkan bentuk: `slug` memakai
    // @default(uuid()), jadi slug bawaan berbentuk UUID dan tidak bisa
    // dibedakan dari id. Dicocokkan ke dua kolom sekaligus.
    const company = await this.prisma.companyProfile.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: {
        ...PUBLIC_COMPANY_SELECT,
        challenges: {
          // Penyaringnya dulu hanya `isPrivate: false`. Draf yang batas
          // akhirnya sudah lewat masuk ke kelompok "completed", dan draf yang
          // tanggal mulainya di depan masuk ke "upcoming" — isi soal yang
          // belum diterbitkan tampil di profil publik perusahaan.
          // CLOSED tetap ikut karena mengisi kelompok "completed"; hanya DRAFT
          // yang disembunyikan.
          where: {
            isPrivate: false,
            status: {
              in: [ChallengeStatus.PUBLISHED, ChallengeStatus.CLOSED],
            },
          },
          select: PUBLIC_CHALLENGE_SELECT,
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

    for (const raw of company.challenges) {
      const challenge = flattenCategory(raw);
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
    const inviteCode = crypto
      .randomBytes(16)
      .toString('base64url')
      .toUpperCase();
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

  async updateMemberStatus(
    companyId: string,
    memberId: string,
    status: 'APPROVED' | 'REJECTED',
  ) {
    const member = await this.prisma.companyMember.findFirst({
      where: { id: memberId, companyId },
    });
    if (!member) {
      throw new NotFoundException('Anggota tim tidak ditemukan');
    }

    if (status === 'REJECTED') {
      return this.prisma.companyMember.delete({
        where: { id: memberId },
      });
    }

    return this.prisma.companyMember.update({
      where: { id: memberId },
      data: { status },
    });
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
