import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDiscussionDto } from './dto/create-discussion.dto';

@Injectable()
export class DiscussionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, challengeId: string, dto: CreateDiscussionDto) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
    });

    if (!challenge) {
      throw new NotFoundException('Challenge tidak ditemukan');
    }

    if (dto.parentId) {
      const parent = await this.prisma.discussion.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent || parent.challengeId !== challengeId) {
        throw new NotFoundException(
          'Thread induk tidak ditemukan atau tidak valid',
        );
      }
    }

    return this.prisma.discussion.create({
      data: {
        userId,
        challengeId,
        message: dto.message,
        parentId: dto.parentId,
      },
      include: {
        user: { select: { email: true, role: true } },
      },
    });
  }

  async getByChallenge(challengeId: string) {
    return this.prisma.discussion.findMany({
      where: { challengeId },
      include: {
        user: { select: { email: true, role: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
