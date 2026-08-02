import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CHALLENGE_CATEGORY_SELECT,
  flattenCategory,
} from '../common/selects/challenge-category.select';

@Injectable()
export class PortfoliosService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicPortfolios(query: {
    search?: string;
    skill?: string;
    limit?: number;
  }) {
    const where: any = { isPublic: true };

    if (query.skill) {
      where.talent = { skills: { has: query.skill } };
    }

    if (query.search) {
      where.OR = [
        { showcaseSummary: { contains: query.search, mode: 'insensitive' } },
        {
          talent: {
            fullName: { contains: query.search, mode: 'insensitive' },
          },
        },
      ];
    }

    const portfolios = await this.prisma.portfolio.findMany({
      where,
      include: {
        talent: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            headline: true,
            skills: true,
            githubUrl: true,
            linkedinUrl: true,
            faceVerificationStatus: true,
          },
        },
        submission: {
          include: {
            challenge: {
              select: {
                title: true,
                difficulty: true,
                category: CHALLENGE_CATEGORY_SELECT,
                company: { select: { companyName: true, logoUrl: true } },
              },
            },
          },
        },
      },
      take: query.limit ? Number(query.limit) : 20,
      orderBy: { createdAt: 'desc' },
    });

    return portfolios.map((portfolio) => ({
      ...portfolio,
      submission: {
        ...portfolio.submission,
        challenge: flattenCategory(portfolio.submission.challenge),
      },
    }));
  }

  /**
   * Direktori talenta publik.
   *
   * Sebelum ini profil talenta hanya bisa dicapai lewat papan peringkat, jadi
   * perusahaan sama sekali tidak punya cara menelusuri kandidat — sementara
   * menu "Direktori Perusahaan" justru menampilkan sesama perusahaan.
   *
   * Yang dikembalikan hanya bidang yang memang publik. Email, NIK, dan data
   * biometrik tidak pernah ikut.
   */
  async getPublicTalents(query: {
    search?: string;
    skill?: string;
    roleCategory?: string;
    page?: number;
    limit?: number;
  }) {
    const where: any = {};

    if (query.skill) {
      where.skills = { has: query.skill };
    }

    if (query.roleCategory) {
      where.roleCategory = query.roleCategory;
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { headline: { contains: search, mode: 'insensitive' } },
        { skills: { has: search } },
      ];
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(60, Math.max(1, Number(query.limit) || 24));

    const [data, total] = await this.prisma.$transaction([
      this.prisma.talentProfile.findMany({
        where,
        select: {
          id: true,
          slug: true,
          fullName: true,
          avatarUrl: true,
          headline: true,
          xp: true,
          level: true,
          skills: true,
          location: true,
          roleCategory: true,
          faceVerificationStatus: true,
        },
        orderBy: [{ xp: 'desc' }, { fullName: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.talentProfile.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  /**
   * Papan peringkat, disaring di server.
   *
   * Penyaringan dulu dilakukan di peramban terhadap 50 baris teratas yang sudah
   * terlanjur diambil. Itu salah dua kali: bidang yang tidak punya wakil di 50
   * besar global tampil kosong walau talentanya ada, dan daftar pilihannya
   * ditulis tangan di halaman — terpisah dari nilai yang benar-benar tersimpan,
   * sehingga tidak satu pun pilihan cocok. `take` sekarang berlaku setelah
   * `where`, jadi yang keluar adalah peringkat teratas DI DALAM bidang itu.
   */
  async getLeaderboard(
    limit: number = 10,
    filter: { roleCategory?: string; location?: string } = {},
  ) {
    const where: any = {};

    if (filter.roleCategory) {
      where.roleCategory = filter.roleCategory;
    }

    // `location` adalah teks bebas yang diketik talenta sendiri, jadi
    // pencocokan persis membuang "Jakarta Selatan" ketika yang dipilih
    // "Jakarta".
    if (filter.location) {
      where.location = { contains: filter.location, mode: 'insensitive' };
    }

    return this.prisma.talentProfile.findMany({
      where,
      select: {
        id: true,
        slug: true,
        userId: true,
        fullName: true,
        avatarUrl: true,
        headline: true,
        xp: true,
        level: true,
        skills: true,
        location: true,
        roleCategory: true,
        faceVerificationStatus: true,
        // `earnedBadges` sengaja tidak diikutkan. Papan peringkat tidak pernah
        // menampilkannya, dan menyertakannya berarti satu join lencana untuk
        // tiap baris. Profil talenta yang memang merendernya mengambil sendiri
        // lewat UsersService.
      },
      orderBy: { xp: 'desc' },
      take: Number(limit),
    });
  }
}
