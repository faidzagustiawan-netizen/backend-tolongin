import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverviewStats() {
    const totalUsers = await this.prisma.user.count();
    const totalTalents = await this.prisma.user.count({ where: { role: 'TALENT' } });
    const totalCompanies = await this.prisma.user.count({ where: { role: 'COMPANY' } });
    const totalChallenges = await this.prisma.challenge.count();
    const totalSubmissions = await this.prisma.submission.count();
    
    return {
      totalUsers,
      totalTalents,
      totalCompanies,
      totalChallenges,
      totalSubmissions,
    };
  }

  async getPendingCompanies() {
    return this.prisma.companyProfile.findMany({
      where: {
        kybStatus: 'PENDING',
      },
      include: {
        user: true,
      }
    });
  }

  async verifyCompany(companyId: string, status: 'VERIFIED' | 'FAILED') {
    const company = await this.prisma.companyProfile.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return this.prisma.companyProfile.update({
      where: { id: companyId },
      data: { kybStatus: status },
    });
  }

  // --- Expanded Admin Features ---

  async getAllUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isVerified: true,
        isBanned: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async toggleBanUser(userId: string, isBanned: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    
    return this.prisma.user.update({
      where: { id: userId },
      data: { isBanned },
    });
  }

  async sendWarning(userId: string, message: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.notification.create({
      data: {
        userId,
        title: 'Peringatan Admin',
        content: message,
      }
    });
  }

  async getAllChallenges() {
    return this.prisma.challenge.findMany({
      include: {
        company: {
          select: { companyName: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async takedownChallenge(challengeId: string) {
    const challenge = await this.prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!challenge) throw new NotFoundException('Challenge not found');

    // Option 1: Soft delete or status change. Since there is no status, we can just delete it or mark it.
    // The user said "takedown aja jangan sampai bisa edit". Let's delete it.
    return this.prisma.challenge.delete({
      where: { id: challengeId }
    });
  }
}
