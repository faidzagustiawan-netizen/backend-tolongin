import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  async searchSkills(query: string) {
    if (!query) return [];
    return this.prisma.skill.findMany({
      where: {
        name: {
          contains: query,
          mode: 'insensitive',
        },
      },
      take: 20,
    });
  }

  async createSkill(name: string) {
    const existing = await this.prisma.skill.findUnique({
      where: { name },
    });
    if (existing) return existing;

    return this.prisma.skill.create({
      data: { name },
    });
  }
}
