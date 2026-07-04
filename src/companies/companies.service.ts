import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChallengeStatus } from '@prisma/client';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.companyProfile.findMany({
      include: {
        _count: {
          select: { challenges: true },
        },
      },
      orderBy: { trustScore: 'desc' },
    });
  }

  async findOne(id: string) {
    const company = await this.prisma.companyProfile.findUnique({
      where: { id },
      include: {
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
}
