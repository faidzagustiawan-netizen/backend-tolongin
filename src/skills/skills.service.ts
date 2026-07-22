import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SkillsService {
  private cachedSkills: { id: string, name: string }[] = [];
  private cacheTimestamp = 0;
  constructor(private readonly prisma: PrismaService) {}

  private levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) == a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
        }
      }
    }
    return matrix[b.length][a.length];
  }

  async searchSkills(query: string) {
    if (!query) return [];
    
    // 1. Try exact/contains search first
    const exactMatches = await this.prisma.skill.findMany({
      where: {
        name: {
          contains: query,
          mode: 'insensitive',
        },
      },
      take: 20,
    });

    if (exactMatches.length > 0) {
      return exactMatches;
    }

    // 2. Fallback to Levenshtein distance for typos (e.g. ui/uz -> UI/UX)
    const now = Date.now();
    if (now - this.cacheTimestamp > 1000 * 60 * 5) { // 5 minute cache
      this.cachedSkills = await this.prisma.skill.findMany({
        select: { id: true, name: true }
      });
      this.cacheTimestamp = now;
    }

    const q = query.toLowerCase();
    const scored = this.cachedSkills.map(s => {
      // Calculate distance between typed query and the first N chars of the skill, or the whole skill
      const skillName = s.name.toLowerCase();
      // Distance to the whole word
      const dist1 = this.levenshtein(q, skillName);
      // Distance to the prefix of the same length
      const dist2 = skillName.length >= q.length ? this.levenshtein(q, skillName.substring(0, q.length)) : dist1;
      
      return { ...s, dist: Math.min(dist1, dist2) };
    });

    scored.sort((a, b) => a.dist - b.dist);
    // Return top 5 matches that have a reasonable distance (<= 3 typos)
    return scored.filter(s => s.dist <= 3).slice(0, 5).map(s => ({ id: s.id, name: s.name, _dist: s.dist }));
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
