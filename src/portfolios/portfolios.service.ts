import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

    return this.prisma.portfolio.findMany({
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
                category: true,
                company: { select: { companyName: true, logoUrl: true } },
              },
            },
          },
        },
      },
      take: query.limit ? Number(query.limit) : 20,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getLeaderboard(limit: number = 10) {
    return this.prisma.talentProfile.findMany({
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        headline: true,
        xp: true,
        level: true,
        skills: true,
        location: true,
        roleCategory: true,
        faceVerificationStatus: true,
        earnedBadges: {
          include: { badge: true },
        },
      },
      orderBy: { xp: 'desc' },
      take: Number(limit),
    });
  }
}
